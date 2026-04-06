import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import AuditLogResponse
from src.models.audit_log import AuditLog
from src.models.tenant import Tenant
from src.utils.crypto import verify_audit_chain

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    event_type: str | None = Query(None),
    memory_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLog]:
    """Query audit logs."""
    query = select(AuditLog).where(AuditLog.tenant_id == tenant.id)
    if event_type:
        query = query.where(AuditLog.event_type == event_type)
    if memory_id:
        query = query.where(AuditLog.memory_id == memory_id)
    query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/verify-integrity")
async def verify_integrity(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify audit log chain integrity."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id)
        .order_by(AuditLog.created_at.asc())
    )
    entries = list(result.scalars().all())
    if not entries:
        return {"valid": True, "entries_checked": 0}

    is_valid, broken_at = verify_audit_chain(entries)
    return {
        "valid": is_valid,
        "entries_checked": len(entries),
        "first_broken_index": broken_at,
    }
