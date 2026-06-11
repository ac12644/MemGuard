import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.engine.fact_classifier import classify_fact_type, get_fact_type_volatility
from src.engine.strategies.semantic_drift import validate_semantic_drift
from src.engine.strategies.source_linked import validate_source_linked
from src.engine.strategies.temporal_pattern import validate_temporal_pattern
from src.engine.trust_calculator import calculate_trust_score
from src.models.memory_record import MemoryRecord
from src.models.quarantine_entry import QuarantineEntry
from src.models.staleness_pattern import StalenessPattern
from src.models.validation_job import ValidationJob
from src.models.validation_result import ValidationResult

logger = structlog.get_logger()


async def run_validation_job(job_id: uuid.UUID, db: AsyncSession) -> None:
    """Main validation orchestrator. Runs the appropriate strategy for each memory."""
    job = await db.get(ValidationJob, job_id)
    if not job:
        logger.error("validation_job_not_found", job_id=str(job_id))
        return

    job.status = "running"
    job.started_at = datetime.now(UTC)
    await db.flush()

    try:
        # Fetch memories to validate
        query = select(MemoryRecord).where(
            MemoryRecord.tenant_id == job.tenant_id,
            MemoryRecord.status.in_(["active", "flagged"]),
        )
        if job.connector_id:
            query = query.where(MemoryRecord.connector_id == job.connector_id)
        query = query.limit(settings.memguard_max_validation_batch)

        result = await db.execute(query)
        memories = list(result.scalars().all())
        job.total_memories = len(memories)

        for memory in memories:
            try:
                # Classify fact type if not set (temporal_pattern needs it pre-validation)
                if not memory.fact_type:
                    fact_type, _ = classify_fact_type(memory.content)
                    memory.fact_type = fact_type

                evidence = await _validate_memory(memory, job.job_type, db)
                outcome = evidence["outcome"]
                previous_trust = memory.trust_score

                # Update trust score
                new_trust = _compute_new_trust(memory, evidence)
                memory.trust_score = new_trust
                memory.last_validated_at = datetime.now(UTC)
                memory.validation_count += 1

                # Auto-quarantine on direct contradiction or when trust falls below threshold
                if outcome == "quarantined" or (
                    new_trust < settings.memguard_quarantine_threshold and outcome == "flagged"
                ):
                    memory.status = "quarantined"
                    outcome = "quarantined"
                    db.add(QuarantineEntry(
                        memory_id=memory.id,
                        tenant_id=memory.tenant_id,
                        reason=_quarantine_reason(evidence),
                        original_content=memory.content,
                        original_trust_score=previous_trust,
                    ))
                    job.quarantined_count += 1
                elif new_trust < settings.memguard_default_trust_threshold:
                    memory.status = "flagged"
                    if outcome != "flagged":
                        outcome = "flagged"
                    job.flagged_count += 1
                elif outcome == "verified":
                    memory.status = "active"

                # Record result
                db.add(ValidationResult(
                    job_id=job.id,
                    memory_id=memory.id,
                    strategy=job.job_type,
                    previous_trust_score=previous_trust,
                    new_trust_score=new_trust,
                    outcome=outcome,
                    evidence=evidence,
                ))

                job.validated_count += 1
                job.progress = job.validated_count / max(job.total_memories, 1)

            except Exception as e:
                logger.error("memory_validation_failed", memory_id=str(memory.id), error=str(e))
                db.add(ValidationResult(
                    job_id=job.id,
                    memory_id=memory.id,
                    strategy=job.job_type,
                    outcome="error",
                    evidence={"error": str(e)},
                ))
                job.validated_count += 1

        job.status = "completed"
        job.progress = 1.0
        job.completed_at = datetime.now(UTC)

    except Exception as e:
        logger.error("validation_job_failed", job_id=str(job_id), error=str(e))
        job.status = "failed"
        job.error_message = str(e)

    await db.flush()


async def _validate_memory(memory: MemoryRecord, strategy: str, db: AsyncSession) -> dict:
    """Run the specified validation strategy on a single memory."""
    if strategy == "source_linked":
        source_url = (memory.source_metadata or {}).get("source_url")
        if not source_url:
            return {
                "outcome": "error",
                "reasoning": "No source URL available for source-linked validation",
                "confidence": 0.0,
                "drift_detected": False,
            }
        source_field = (memory.source_metadata or {}).get("source_field")
        return await validate_source_linked(
            memory_content=memory.content,
            source_url=source_url,
            source_field=source_field,
        )
    if strategy == "semantic_drift":
        recent_context = await _fetch_recent_context(memory, db)
        return await validate_semantic_drift(
            memory_content=memory.content,
            memory_created_at=memory.created_at,
            recent_context=recent_context,
        )
    if strategy == "temporal_pattern":
        pattern = await _fetch_staleness_pattern(memory, db)
        return await validate_temporal_pattern(
            memory_content=memory.content,
            memory_created_at=memory.created_at,
            fact_type=memory.fact_type,
            learned_avg_staleness_days=pattern.avg_staleness_days if pattern else None,
            learned_sample_size=pattern.sample_size if pattern else 0,
            last_validated_at=memory.last_validated_at,
        )
    # Remaining strategies (cross_reference, causal_chain) will be added in Phase 7
    return {
        "outcome": "error",
        "reasoning": f"Strategy '{strategy}' not yet implemented",
        "confidence": 0.0,
        "drift_detected": False,
    }


async def _fetch_recent_context(
    memory: MemoryRecord, db: AsyncSession, limit: int = 10
) -> list[str]:
    """Gather recent memories from the same tenant/connector as drift context.

    Connectors don't expose raw conversation history, so the most recently
    created sibling memories serve as the proxy for recent agent context.
    """
    query = (
        select(MemoryRecord.content)
        .where(
            MemoryRecord.tenant_id == memory.tenant_id,
            MemoryRecord.connector_id == memory.connector_id,
            MemoryRecord.id != memory.id,
            MemoryRecord.status.in_(["active", "flagged"]),
            MemoryRecord.created_at > memory.created_at,
        )
        .order_by(MemoryRecord.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_staleness_pattern(
    memory: MemoryRecord, db: AsyncSession
) -> StalenessPattern | None:
    """Look up the learned staleness pattern for this memory's fact type."""
    if not memory.fact_type:
        return None
    result = await db.execute(
        select(StalenessPattern).where(
            StalenessPattern.tenant_id == memory.tenant_id,
            StalenessPattern.fact_type == memory.fact_type,
        )
    )
    return result.scalar_one_or_none()


def _quarantine_reason(evidence: dict) -> str:
    """Map validation evidence to a quarantine reason."""
    if evidence.get("contradicted"):
        return "contradicted"
    if (
        evidence.get("drift_detected")
        or evidence.get("likely_stale")
        or evidence.get("staleness_probability", 0.0) > 0.7
    ):
        return "stale"
    return "contradicted"


def _compute_new_trust(memory: MemoryRecord, evidence: dict) -> float:
    """Compute updated trust score based on validation evidence."""
    outcome = evidence.get("outcome", "error")
    confidence = evidence.get("confidence", 0.5)

    if outcome == "verified":
        # Boost trust toward 1.0
        return calculate_trust_score(
            source_reliability=confidence,
            time_since_verified=0,
            fact_type_volatility=get_fact_type_volatility(memory.fact_type),
            cross_ref_agreement=0.8,
            dependency_health=1.0,
            historical_accuracy=min(1.0, (memory.trust_score + confidence) / 2),
            retrieval_frequency=min(1.0, memory.retrieval_count / 100),
        )
    elif outcome == "quarantined":
        # Direct contradiction: drop trust hard, below the quarantine threshold
        penalized = memory.trust_score - 0.5 * confidence
        return max(0.0, min(penalized, settings.memguard_quarantine_threshold - 0.05))
    elif outcome == "flagged":
        # Decrease trust significantly
        drift_detected = (
            evidence.get("drift_detected")
            or evidence.get("likely_stale")
            or evidence.get("staleness_probability", 0.0) > 0.7
        )
        drift_penalty = 0.3 if drift_detected else 0.15
        return max(0.0, memory.trust_score - drift_penalty * confidence)
    elif outcome == "source_unavailable":
        # Slight decrease
        return max(0.0, memory.trust_score - 0.1)
    else:
        # Error: don't change much
        return memory.trust_score
