import math


def calculate_trust_score(
    source_reliability: float = 0.8,
    time_since_verified: float = 0.0,
    fact_type_volatility: float = 0.5,
    cross_ref_agreement: float = 0.8,
    dependency_health: float = 1.0,
    historical_accuracy: float = 0.8,
    retrieval_frequency: float = 0.5,
    weights: dict[str, float] | None = None,
) -> float:
    """Calculate composite trust score.

    Args:
        source_reliability: 0-1, how reliable is the original source.
        time_since_verified: Hours since last successful validation.
        fact_type_volatility: 0-1, how fast this fact-type typically changes.
        cross_ref_agreement: 0-1, agreement ratio across multiple sources.
        dependency_health: 0-1, average trust of upstream dependencies.
        historical_accuracy: 0-1, what % of past validations were accurate.
        retrieval_frequency: Normalized, how often this memory is accessed.
        weights: Optional custom weights per tenant.

    Returns:
        Trust score between 0.0 and 1.0.
    """
    w = weights or {
        "source_reliability": 0.20,
        "freshness": 0.25,
        "cross_ref": 0.20,
        "dependency": 0.10,
        "historical": 0.15,
        "retrieval_importance": 0.10,
    }

    # Freshness decays exponentially based on fact-type volatility
    half_life_hours = (1 - fact_type_volatility) * 720 + 24  # 24h to 744h
    freshness = math.exp(-0.693 * time_since_verified / half_life_hours)

    retrieval_weight = min(1.0, retrieval_frequency)

    score = (
        w["source_reliability"] * source_reliability
        + w["freshness"] * freshness
        + w["cross_ref"] * cross_ref_agreement
        + w["dependency"] * dependency_health
        + w["historical"] * historical_accuracy
        + w["retrieval_importance"] * retrieval_weight
    )

    return round(max(0.0, min(1.0, score)), 4)
