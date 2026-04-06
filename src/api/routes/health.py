from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Service health check."""
    checks = {"status": "healthy", "database": "unknown", "redis": "unknown"}

    # Database check
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {e}"
        checks["status"] = "degraded"

    # Redis check
    try:
        import redis.asyncio as aioredis

        from src.config import settings

        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {e}"
        checks["status"] = "degraded"

    return checks


@router.get("/health/detailed")
async def detailed_health(db: AsyncSession = Depends(get_db)) -> dict:
    """Detailed health check with metrics for monitoring systems."""
    import time

    from sqlalchemy import func, select

    from src.config import settings
    from src.models.connector_config import ConnectorConfig
    from src.models.memory_record import MemoryRecord
    from src.models.validation_job import ValidationJob

    start = time.monotonic()
    result: dict = {"status": "healthy", "version": "0.1.0", "env": settings.memguard_env}

    # DB check with latency
    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        result["database"] = {"status": "healthy", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as e:
        result["database"] = {"status": "unhealthy", "error": str(e)}
        result["status"] = "degraded"

    # Redis check with latency
    try:
        import redis.asyncio as aioredis
        t0 = time.monotonic()
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        result["redis"] = {"status": "healthy", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as e:
        result["redis"] = {"status": "unhealthy", "error": str(e)}
        result["status"] = "degraded"

    # Counts
    try:
        memories = (await db.execute(select(func.count()).select_from(MemoryRecord))).scalar() or 0
        connectors = (await db.execute(select(func.count()).select_from(ConnectorConfig))).scalar() or 0
        jobs = (await db.execute(
            select(func.count()).where(ValidationJob.status == "running")
        )).scalar() or 0
        result["metrics"] = {
            "total_memories": memories,
            "active_connectors": connectors,
            "running_jobs": jobs,
        }
    except Exception:
        pass

    result["total_latency_ms"] = round((time.monotonic() - start) * 1000, 1)
    return result
