import asyncio
import uuid

from celery import Celery
from celery.schedules import crontab

from src.config import settings

app = Celery("memguard", broker=settings.redis_url, backend=settings.redis_url)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "full-sweep-weekly": {
            "task": "src.scheduler.tasks.run_validation_sweep",
            "schedule": crontab(hour=2, minute=0, day_of_week="sunday"),
            "kwargs": {"strategy": "source_linked", "max_age_days": 7},
        },
        "high-priority-daily": {
            "task": "src.scheduler.tasks.run_priority_validation",
            "schedule": crontab(hour=3, minute=0),
            "kwargs": {"top_n": 50, "strategy": "source_linked"},
        },
        "pattern-update-weekly": {
            "task": "src.scheduler.tasks.update_staleness_patterns",
            "schedule": crontab(hour=4, minute=0, day_of_week="monday"),
        },
        "connector-sync-hourly": {
            "task": "src.scheduler.tasks.sync_all_connectors",
            "schedule": crontab(minute=0),
        },
    },
)


def _run_async(coro):
    """Run an async function from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.task(name="src.scheduler.tasks.run_validation_sweep")
def run_validation_sweep(strategy: str = "source_linked", max_age_days: int = 7) -> dict:
    """Full sweep: validate memories not checked in max_age_days."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from src.api.deps import async_session_factory
    from src.engine.validator import run_validation_job
    from src.models.memory_record import MemoryRecord
    from src.models.validation_job import ValidationJob

    async def _sweep():
        async with async_session_factory() as db:
            # Find tenants with active memories
            cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
            result = await db.execute(
                select(MemoryRecord.tenant_id)
                .where(
                    MemoryRecord.status.in_(["active", "flagged"]),
                    (MemoryRecord.last_validated_at < cutoff) | (MemoryRecord.last_validated_at.is_(None)),
                )
                .distinct()
            )
            tenant_ids = [row[0] for row in result.all()]

            jobs_created = 0
            for tenant_id in tenant_ids:
                job = ValidationJob(
                    tenant_id=tenant_id,
                    job_type=strategy,
                    priority=5,
                    config={"max_age_days": max_age_days, "trigger": "scheduled_sweep"},
                )
                db.add(job)
                await db.flush()
                await run_validation_job(job.id, db)
                jobs_created += 1

            await db.commit()
            return {"jobs_created": jobs_created}

    return _run_async(_sweep())


@app.task(name="src.scheduler.tasks.run_priority_validation")
def run_priority_validation(top_n: int = 50, strategy: str = "source_linked") -> dict:
    """Validate the top-N highest-priority memories."""
    from sqlalchemy import select

    from src.api.deps import async_session_factory
    from src.engine.validator import run_validation_job
    from src.models.memory_record import MemoryRecord
    from src.models.validation_job import ValidationJob
    from src.scheduler.prioritizer import calculate_validation_priority

    async def _priority():
        async with async_session_factory() as db:
            result = await db.execute(
                select(MemoryRecord).where(MemoryRecord.status.in_(["active", "flagged"]))
            )
            memories = list(result.scalars().all())

            # Sort by priority and take top_n
            prioritized = sorted(memories, key=calculate_validation_priority, reverse=True)[:top_n]
            if not prioritized:
                return {"validated": 0}

            # Group by tenant
            by_tenant: dict[uuid.UUID, list] = {}
            for m in prioritized:
                by_tenant.setdefault(m.tenant_id, []).append(m)

            total = 0
            for tenant_id in by_tenant:
                job = ValidationJob(
                    tenant_id=tenant_id,
                    job_type=strategy,
                    priority=1,
                    config={"trigger": "priority_daily", "top_n": top_n},
                )
                db.add(job)
                await db.flush()
                await run_validation_job(job.id, db)
                total += 1

            await db.commit()
            return {"jobs_created": total}

    return _run_async(_priority())


@app.task(name="src.scheduler.tasks.update_staleness_patterns")
def update_staleness_patterns() -> dict:
    """Recalculate staleness patterns from validation history."""
    from datetime import datetime, timezone

    from sqlalchemy import func, select

    from src.api.deps import async_session_factory
    from src.models.memory_record import MemoryRecord
    from src.models.staleness_pattern import StalenessPattern
    from src.models.validation_result import ValidationResult

    async def _update():
        async with async_session_factory() as db:
            # Get flagged/quarantined results grouped by fact_type
            query = (
                select(
                    MemoryRecord.tenant_id,
                    MemoryRecord.fact_type,
                    func.count().label("sample_size"),
                    func.avg(
                        func.extract("epoch", ValidationResult.created_at - MemoryRecord.created_at) / 86400
                    ).label("avg_days"),
                )
                .join(ValidationResult, ValidationResult.memory_id == MemoryRecord.id)
                .where(ValidationResult.outcome.in_(["flagged", "quarantined"]))
                .where(MemoryRecord.fact_type.is_not(None))
                .group_by(MemoryRecord.tenant_id, MemoryRecord.fact_type)
            )
            rows = (await db.execute(query)).all()

            updated = 0
            for row in rows:
                tenant_id, fact_type, sample_size, avg_days = row
                existing = await db.execute(
                    select(StalenessPattern).where(
                        StalenessPattern.tenant_id == tenant_id,
                        StalenessPattern.fact_type == fact_type,
                    )
                )
                pattern = existing.scalar_one_or_none()
                if pattern:
                    pattern.avg_staleness_days = float(avg_days) if avg_days else None
                    pattern.sample_size = sample_size
                    pattern.last_computed_at = datetime.now(timezone.utc)
                else:
                    db.add(StalenessPattern(
                        tenant_id=tenant_id,
                        fact_type=fact_type,
                        avg_staleness_days=float(avg_days) if avg_days else None,
                        sample_size=sample_size,
                        last_computed_at=datetime.now(timezone.utc),
                    ))
                updated += 1

            await db.commit()
            return {"patterns_updated": updated}

    return _run_async(_update())


@app.task(name="src.scheduler.tasks.sync_all_connectors")
def sync_all_connectors() -> dict:
    """Pull new/updated memories from all active connectors."""
    from sqlalchemy import select

    from src.api.deps import async_session_factory
    from src.connectors.registry import get_connector
    from src.engine.fact_classifier import classify_fact_type
    from src.models.connector_config import ConnectorConfig
    from src.models.memory_record import MemoryRecord

    async def _sync():
        async with async_session_factory() as db:
            result = await db.execute(
                select(ConnectorConfig).where(ConnectorConfig.is_active.is_(True))
            )
            connectors = list(result.scalars().all())

            total_synced = 0
            for config in connectors:
                try:
                    conn = get_connector(config.connector_type, config.config)
                    memories = await conn.fetch_memories(limit=100)

                    for mem in memories:
                        existing = await db.execute(
                            select(MemoryRecord).where(
                                MemoryRecord.tenant_id == config.tenant_id,
                                MemoryRecord.connector_id == config.id,
                                MemoryRecord.external_id == mem.external_id,
                            )
                        )
                        record = existing.scalar_one_or_none()
                        if record:
                            record.content = mem.content
                            record.source_metadata = {
                                "source_type": mem.source_type,
                                "source_url": mem.source_url,
                                "source_field": mem.source_field,
                                **(mem.metadata or {}),
                            }
                        else:
                            fact_type, _ = classify_fact_type(mem.content)
                            db.add(MemoryRecord(
                                tenant_id=config.tenant_id,
                                connector_id=config.id,
                                external_id=mem.external_id,
                                content=mem.content,
                                fact_type=fact_type,
                                source_metadata={
                                    "source_type": mem.source_type,
                                    "source_url": mem.source_url,
                                    "source_field": mem.source_field,
                                    **(mem.metadata or {}),
                                },
                            ))
                            total_synced += 1

                    from datetime import datetime, timezone
                    config.last_sync_at = datetime.now(timezone.utc)
                except Exception as e:
                    from structlog import get_logger
                    get_logger().error("connector_sync_failed", connector_id=str(config.id), error=str(e))

            await db.commit()
            return {"connectors_synced": len(connectors), "new_memories": total_synced}

    return _run_async(_sync())
