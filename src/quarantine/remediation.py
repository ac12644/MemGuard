import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.registry import get_connector
from src.engine.strategies.source_linked import validate_source_linked
from src.models.connector_config import ConnectorConfig
from src.models.memory_record import MemoryRecord
from src.models.quarantine_entry import QuarantineEntry
from src.quarantine.manager import auto_remediate

logger = structlog.get_logger()


async def attempt_remediation(entry_id: uuid.UUID, db: AsyncSession) -> bool:
    """Try to auto-remediate a quarantined memory by fetching fresh data from its source.

    If the source has a new value, stores it as remediated_content for human approval.
    """
    entry = await db.get(QuarantineEntry, entry_id)
    if not entry:
        return False

    memory = await db.get(MemoryRecord, entry.memory_id)
    if not memory:
        return False

    source_url = (memory.source_metadata or {}).get("source_url")
    if not source_url:
        logger.info("no_source_url_for_remediation", memory_id=str(memory.id))
        return False

    source_field = (memory.source_metadata or {}).get("source_field")
    result = await validate_source_linked(
        memory_content=entry.original_content,
        source_url=source_url,
        source_field=source_field,
    )

    new_value = result.get("source_current_value")
    if not new_value or result["outcome"] in ("error", "source_unavailable"):
        logger.info("remediation_source_unavailable", memory_id=str(memory.id))
        return False

    if result.get("drift_detected") and new_value:
        return await auto_remediate(entry_id, new_value, db)

    return False
