from datetime import datetime, timezone
from typing import Optional

from src.engine.fact_classifier import get_fact_type_volatility
from src.models.memory_record import MemoryRecord


def calculate_validation_priority(memory: MemoryRecord) -> float:
    """Calculate validation priority. Higher score = validate sooner.

    Factors:
    1. Retrieval frequency (high retrieval = more dangerous if stale)
    2. Time since last validation (longer = more urgent)
    3. Fact-type volatility (prices change faster than addresses)
    4. Current trust score (lower trust = check sooner)
    5. Whether it has a fetchable source (cheaper to validate)
    """
    retrieval_score = min(1.0, memory.retrieval_count / 100)

    hours_since_validated = _hours_since(memory.last_validated_at)
    freshness_score = min(1.0, hours_since_validated / 168)  # Normalize to 1 week

    volatility = get_fact_type_volatility(memory.fact_type)

    trust_urgency = 1.0 - memory.trust_score

    source_bonus = 0.2 if (memory.source_metadata or {}).get("source_url") else 0.0

    priority = (
        0.30 * retrieval_score
        + 0.25 * freshness_score
        + 0.20 * volatility
        + 0.15 * trust_urgency
        + 0.10 * source_bonus
    )

    return round(priority, 4)


def _hours_since(dt: Optional[datetime]) -> float:
    if dt is None:
        return 720.0  # Default to 30 days if never validated
    delta = datetime.now(timezone.utc) - dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else datetime.now(timezone.utc) - dt
    return max(0.0, delta.total_seconds() / 3600)
