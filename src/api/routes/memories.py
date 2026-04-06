import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import MemoryRecordResponse, MemoryStatsResponse
from src.models.memory_record import MemoryRecord
from src.models.tenant import Tenant
from src.models.validation_result import ValidationResult

router = APIRouter(prefix="/api/v1/memories", tags=["memories"])


@router.get("", response_model=list[MemoryRecordResponse])
async def list_memories(
    status: str | None = Query(None),
    fact_type: str | None = Query(None),
    min_trust: float | None = Query(None, ge=0.0, le=1.0),
    max_trust: float | None = Query(None, ge=0.0, le=1.0),
    sort_by: str = Query("trust_score", pattern="^(trust_score|retrieval_count|created_at|last_validated_at)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[MemoryRecord]:
    """List tracked memories with filtering and sorting."""
    query = select(MemoryRecord).where(MemoryRecord.tenant_id == tenant.id)

    if status:
        query = query.where(MemoryRecord.status == status)
    if fact_type:
        query = query.where(MemoryRecord.fact_type == fact_type)
    if min_trust is not None:
        query = query.where(MemoryRecord.trust_score >= min_trust)
    if max_trust is not None:
        query = query.where(MemoryRecord.trust_score <= max_trust)

    col = getattr(MemoryRecord, sort_by)
    query = query.order_by(col.desc() if sort_order == "desc" else col.asc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/stats", response_model=MemoryStatsResponse)
async def memory_stats(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregate stats across all tracked memories."""
    tid = tenant.id

    total_q = select(func.count()).where(MemoryRecord.tenant_id == tid)
    total = (await db.execute(total_q)).scalar() or 0

    avg_q = select(func.avg(MemoryRecord.trust_score)).where(MemoryRecord.tenant_id == tid)
    avg_trust = (await db.execute(avg_q)).scalar() or 0.0

    status_q = (
        select(MemoryRecord.status, func.count())
        .where(MemoryRecord.tenant_id == tid)
        .group_by(MemoryRecord.status)
    )
    status_counts = {row[0]: row[1] for row in (await db.execute(status_q)).all()}

    fact_q = (
        select(MemoryRecord.fact_type, func.count())
        .where(MemoryRecord.tenant_id == tid)
        .where(MemoryRecord.fact_type.is_not(None))
        .group_by(MemoryRecord.fact_type)
    )
    fact_dist = {row[0]: row[1] for row in (await db.execute(fact_q)).all()}

    return {
        "total": total,
        "active": status_counts.get("active", 0),
        "flagged": status_counts.get("flagged", 0),
        "quarantined": status_counts.get("quarantined", 0),
        "invalidated": status_counts.get("invalidated", 0),
        "avg_trust_score": round(float(avg_trust), 4),
        "fact_type_distribution": fact_dist,
    }


@router.get("/{memory_id}", response_model=MemoryRecordResponse)
async def get_memory(
    memory_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> MemoryRecord:
    """Get memory details."""
    memory = await db.get(MemoryRecord, memory_id)
    if not memory or memory.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Memory not found")
    return memory


@router.get("/{memory_id}/trust-history", response_model=list)
async def trust_history(
    memory_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Trust score over time for a single memory."""
    result = await db.execute(
        select(ValidationResult)
        .where(ValidationResult.memory_id == memory_id)
        .order_by(ValidationResult.created_at)
    )
    return [
        {
            "timestamp": r.created_at.isoformat(),
            "previous_trust_score": r.previous_trust_score,
            "new_trust_score": r.new_trust_score,
            "strategy": r.strategy,
            "outcome": r.outcome,
        }
        for r in result.scalars().all()
    ]
