import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import QuarantineEntryResponse
from src.models.memory_record import MemoryRecord
from src.models.quarantine_entry import QuarantineEntry
from src.models.tenant import Tenant
from src.utils.audit import emit_audit_event

router = APIRouter(prefix="/api/v1/quarantine", tags=["quarantine"])


@router.get("", response_model=list[QuarantineEntryResponse])
async def list_quarantined(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[QuarantineEntry]:
    """List quarantined memories."""
    result = await db.execute(
        select(QuarantineEntry)
        .where(QuarantineEntry.tenant_id == tenant.id)
        .order_by(QuarantineEntry.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.post("/{entry_id}/restore", status_code=200)
async def restore_memory(
    entry_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Restore a quarantined memory to active."""
    entry = await _get_entry_or_404(entry_id, tenant.id, db)
    memory = await db.get(MemoryRecord, entry.memory_id)
    if memory:
        memory.status = "active"
        memory.content = entry.original_content
        memory.trust_score = entry.original_trust_score
    entry.remediation_status = "restored"
    entry.remediated_by = "human:api"
    entry.remediated_at = datetime.now(UTC)
    await emit_audit_event(
        tenant.id, "memory_restored", db,
        memory_id=entry.memory_id, actor="api:user",
        details={"reason": entry.reason, "trust_score_restored": entry.original_trust_score},
    )
    await db.flush()
    return {"status": "restored", "memory_id": str(entry.memory_id)}


@router.post("/{entry_id}/approve-remediation", status_code=200)
async def approve_remediation(
    entry_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Approve auto-remediated content."""
    entry = await _get_entry_or_404(entry_id, tenant.id, db)
    if not entry.remediated_content:
        raise HTTPException(status_code=400, detail="No remediated content to approve")
    memory = await db.get(MemoryRecord, entry.memory_id)
    if memory:
        memory.content = entry.remediated_content
        memory.status = "active"
        memory.trust_score = 0.8
    entry.remediation_status = "human_approved"
    entry.remediated_by = "human:api"
    entry.remediated_at = datetime.now(UTC)
    await db.flush()
    return {"status": "approved", "memory_id": str(entry.memory_id)}


@router.delete("/{entry_id}", status_code=204)
async def delete_quarantined(
    entry_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a quarantined memory."""
    entry = await _get_entry_or_404(entry_id, tenant.id, db)
    memory = await db.get(MemoryRecord, entry.memory_id)
    if memory:
        memory.status = "invalidated"
    entry.remediation_status = "deleted"
    await db.flush()


async def _get_entry_or_404(entry_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession) -> QuarantineEntry:
    entry = await db.get(QuarantineEntry, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Quarantine entry not found")
    return entry
