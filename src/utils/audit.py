import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.audit_log import AuditLog
from src.utils.crypto import compute_audit_checksum


async def emit_audit_event(
    tenant_id: uuid.UUID,
    event_type: str,
    db: AsyncSession,
    memory_id: uuid.UUID | None = None,
    actor: str = "system",
    details: dict | None = None,
) -> AuditLog:
    """Write an audit log entry with chained checksum."""
    # Get the last checksum for this tenant
    result = await db.execute(
        select(AuditLog.checksum)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    prev_checksum = last if last else "GENESIS"

    event_details = details or {}
    checksum = compute_audit_checksum(prev_checksum, event_details)

    entry = AuditLog(
        tenant_id=tenant_id,
        event_type=event_type,
        memory_id=memory_id,
        actor=actor,
        details=event_details,
        checksum=checksum,
    )
    db.add(entry)
    return entry
