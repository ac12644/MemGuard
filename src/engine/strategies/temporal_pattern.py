import math
from datetime import UTC, datetime

import structlog

from src.engine.fact_classifier import DEFAULT_STALENESS_DAYS

logger = structlog.get_logger()

# Minimum sample size before we trust learned patterns over defaults.
MIN_SAMPLE_SIZE = 20


async def validate_temporal_pattern(
    memory_content: str,
    memory_created_at: datetime,
    fact_type: str | None,
    learned_avg_staleness_days: float | None = None,
    learned_sample_size: int = 0,
    last_validated_at: datetime | None = None,
) -> dict:
    """Predict whether a memory is likely stale based on its fact-type and age
    using an exponential decay model.

    Uses learned staleness patterns from the ``staleness_patterns`` table when
    sufficient data exists; otherwise falls back to default curves from
    ``DEFAULT_STALENESS_DAYS``.

    Args:
        memory_content: The stored memory text (used for logging).
        memory_created_at: When the memory was originally recorded.
        fact_type: Classified fact type (e.g. ``"job_title"``, ``"pricing"``).
        learned_avg_staleness_days: Average days-to-staleness from historical
            validation data for this fact type.  ``None`` if unavailable.
        learned_sample_size: Number of validation samples behind the learned
            average.  Used to decide whether to trust learned data.
        last_validated_at: When the memory was last successfully validated.

    Returns:
        {
            "outcome": "verified" | "flagged" | "error",
            "staleness_probability": float,
            "predicted_days_until_stale": float | None,
            "confidence": float,
            "reasoning": str,
        }
    """
    try:
        return await _compute(
            memory_content=memory_content,
            memory_created_at=memory_created_at,
            fact_type=fact_type,
            learned_avg_staleness_days=learned_avg_staleness_days,
            learned_sample_size=learned_sample_size,
            last_validated_at=last_validated_at,
        )
    except Exception as e:
        logger.error("temporal_pattern.unexpected_error", error=str(e))
        return _result(outcome="error", reasoning=f"Unexpected error: {e}")


async def _compute(
    memory_content: str,
    memory_created_at: datetime,
    fact_type: str | None,
    learned_avg_staleness_days: float | None,
    learned_sample_size: int,
    last_validated_at: datetime | None,
) -> dict:
    now = datetime.now(UTC)

    # Determine the reference point for age calculation.  If the memory was
    # recently validated successfully, measure from that point instead of
    # original creation to avoid penalising well-maintained memories.
    reference = last_validated_at if last_validated_at else memory_created_at
    age_days = max(0.0, (now - reference).total_seconds() / 86400)

    # Pick the avg staleness days to use.
    using_learned = (
        learned_avg_staleness_days is not None
        and learned_avg_staleness_days > 0
        and learned_sample_size >= MIN_SAMPLE_SIZE
    )

    if using_learned:
        avg_staleness_days = learned_avg_staleness_days  # type: ignore[assignment]
        source_label = "learned"
    else:
        avg_staleness_days = DEFAULT_STALENESS_DAYS.get(fact_type or "other", 180)
        source_label = "default"

    # Exponential decay: P(stale) = 1 - exp(-age / avg)
    staleness_probability = 1.0 - math.exp(-age_days / avg_staleness_days)

    # Predicted remaining days until the 50% staleness threshold
    # (i.e., the half-life) from the reference point.
    half_life_days = avg_staleness_days * math.log(2)
    predicted_days_until_stale = max(0.0, half_life_days - age_days)

    # Confidence is higher when using learned data and when the memory is
    # clearly fresh or clearly overdue.
    base_confidence = 0.7 if using_learned else 0.5
    # Boost confidence toward extremes (very fresh or very stale).
    extremity = abs(staleness_probability - 0.5) * 2  # 0..1
    confidence = min(1.0, base_confidence + 0.2 * extremity)

    # Determine outcome.
    if staleness_probability > 0.9:
        outcome = "flagged"
        reasoning = (
            f"High staleness probability ({staleness_probability:.2f}) — "
            f"memory is {age_days:.0f} days old vs {source_label} avg of "
            f"{avg_staleness_days:.0f} days for fact type '{fact_type or 'other'}'"
        )
    elif staleness_probability > 0.7:
        outcome = "flagged"
        reasoning = (
            f"Elevated staleness probability ({staleness_probability:.2f}) — "
            f"approaching typical staleness window for '{fact_type or 'other'}'"
        )
    else:
        outcome = "verified"
        reasoning = (
            f"Staleness probability ({staleness_probability:.2f}) is within "
            f"acceptable range for '{fact_type or 'other'}' "
            f"(avg {avg_staleness_days:.0f} days, age {age_days:.0f} days, "
            f"source: {source_label})"
        )

    logger.info(
        "temporal_pattern.completed",
        outcome=outcome,
        staleness_probability=round(staleness_probability, 4),
        age_days=round(age_days, 1),
        avg_staleness_days=avg_staleness_days,
        source=source_label,
        fact_type=fact_type,
        memory_content=memory_content[:80],
    )

    return {
        "outcome": outcome,
        "staleness_probability": round(staleness_probability, 4),
        "predicted_days_until_stale": round(predicted_days_until_stale, 1),
        "confidence": round(confidence, 4),
        "reasoning": reasoning,
    }


def _result(
    outcome: str = "error",
    staleness_probability: float = 0.0,
    predicted_days_until_stale: float | None = None,
    confidence: float = 0.5,
    reasoning: str = "",
) -> dict:
    return {
        "outcome": outcome,
        "staleness_probability": staleness_probability,
        "predicted_days_until_stale": predicted_days_until_stale,
        "confidence": confidence,
        "reasoning": reasoning,
    }
