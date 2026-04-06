import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.memory_record import MemoryRecord
from src.models.quarantine_entry import QuarantineEntry
from src.utils.crypto import compute_audit_checksum

logger = structlog.get_logger()


async def quarantine_memory(
    memory_id: uuid.UUID,
    reason: str,
    db: AsyncSession,
    validation_result_id: uuid.UUID | None = None,
) -> QuarantineEntry | None:
    """Move a memory into quarantine."""
    memory = await db.get(MemoryRecord, memory_id)
    if not memory:
        logger.warning("quarantine_memory_not_found", memory_id=str(memory_id))
        return None

    entry = QuarantineEntry(
        memory_id=memory.id,
        tenant_id=memory.tenant_id,
        reason=reason,
        original_content=memory.content,
        original_trust_score=memory.trust_score,
        validation_result_id=validation_result_id,
    )
    memory.status = "quarantined"
    db.add(entry)
    await db.flush()

    logger.info("memory_quarantined", memory_id=str(memory_id), reason=reason)
    return entry


async def restore_memory(entry_id: uuid.UUID, db: AsyncSession) -> bool:
    """Restore a quarantined memory to active status."""
    entry = await db.get(QuarantineEntry, entry_id)
    if not entry:
        return False

    memory = await db.get(MemoryRecord, entry.memory_id)
    if memory:
        memory.status = "active"
        memory.content = entry.original_content
        memory.trust_score = entry.original_trust_score

    entry.remediation_status = "restored"
    entry.remediated_by = "system"
    entry.remediated_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info("memory_restored", memory_id=str(entry.memory_id))
    return True


async def auto_remediate(
    entry_id: uuid.UUID,
    new_content: str,
    db: AsyncSession,
) -> bool:
    """Auto-update a quarantined memory with fresh content from source."""
    entry = await db.get(QuarantineEntry, entry_id)
    if not entry:
        return False

    entry.remediated_content = new_content
    entry.remediation_status = "auto_updated"
    entry.remediated_by = "auto"
    entry.remediated_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info("memory_auto_remediated", memory_id=str(entry.memory_id))
    return True


async def get_pending_remediations(tenant_id: uuid.UUID, db: AsyncSession) -> list[QuarantineEntry]:
    """Get quarantine entries pending human review."""
    result = await db.execute(
        select(QuarantineEntry)
        .where(
            QuarantineEntry.tenant_id == tenant_id,
            QuarantineEntry.remediation_status.in_(["pending", "auto_updated"]),
        )
        .order_by(QuarantineEntry.created_at)
    )
    return list(result.scalars().all())
