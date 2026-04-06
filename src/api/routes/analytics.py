from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import HealthScoreResponse, StalenessHeatmapEntry
from src.models.memory_record import MemoryRecord
from src.models.staleness_pattern import StalenessPattern
from src.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/health-score", response_model=HealthScoreResponse)
async def health_score(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Overall memory health score."""
    tid = tenant.id
    base = MemoryRecord.tenant_id == tid

    total = (await db.execute(select(func.count()).where(base))).scalar() or 0
    avg_trust = (await db.execute(select(func.avg(MemoryRecord.trust_score)).where(base))).scalar() or 0.0

    status_q = select(MemoryRecord.status, func.count()).where(base).group_by(MemoryRecord.status)
    status_counts = {row[0]: row[1] for row in (await db.execute(status_q)).all()}

    verified_pct = status_counts.get("active", 0) / total * 100 if total > 0 else 0.0
    overall = round(float(avg_trust) * 0.6 + (verified_pct / 100) * 0.4, 4) if total > 0 else 1.0

    return {
        "overall_score": overall,
        "total_memories": total,
        "verified_pct": round(verified_pct, 2),
        "flagged_count": status_counts.get("flagged", 0),
        "quarantined_count": status_counts.get("quarantined", 0),
        "avg_trust_score": round(float(avg_trust), 4),
    }


@router.get("/staleness-heatmap", response_model=list[StalenessHeatmapEntry])
async def staleness_heatmap(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Staleness rates by fact-type."""
    result = await db.execute(
        select(StalenessPattern).where(StalenessPattern.tenant_id == tenant.id)
    )
    return [
        {
            "fact_type": p.fact_type,
            "avg_staleness_days": p.avg_staleness_days,
            "staleness_rate": p.staleness_rate,
            "sample_size": p.sample_size,
        }
        for p in result.scalars().all()
    ]


@router.get("/high-risk", response_model=list)
async def high_risk_memories(
    limit: int = Query(20, ge=1, le=100),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Memories with lowest trust that are most frequently retrieved."""
    result = await db.execute(
        select(MemoryRecord)
        .where(MemoryRecord.tenant_id == tenant.id)
        .where(MemoryRecord.status == "active")
        .where(MemoryRecord.trust_score < 0.7)
        .order_by(
            (MemoryRecord.retrieval_count * (1 - MemoryRecord.trust_score)).desc()
        )
        .limit(limit)
    )
    return [
        {
            "id": str(m.id),
            "content": m.content[:200],
            "trust_score": m.trust_score,
            "retrieval_count": m.retrieval_count,
            "fact_type": m.fact_type,
            "risk_score": round(m.retrieval_count * (1 - m.trust_score), 2),
        }
        for m in result.scalars().all()
    ]
