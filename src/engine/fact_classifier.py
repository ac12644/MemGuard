import re
from typing import Optional

import structlog

logger = structlog.get_logger()

FACT_TYPE_PATTERNS: dict[str, list[str]] = {
    "job_title": [
        "works as", "role is", "position", "title", "employed as",
        "CEO", "CTO", "CFO", "COO", "engineer", "manager", "director",
        "analyst", "developer", "designer", "consultant",
    ],
    "pricing": [
        "costs", "price", "fee", "rate", r"\$", "€", "£",
        "subscription", "plan", "tier", "per month", "per year",
    ],
    "address": [
        "located at", "address", "headquartered", "office at", "lives at",
        "street", "avenue", "city", "zip", "postal",
    ],
    "company_info": [
        "company", "founded", "employees", "revenue", "acquired",
        "merged", "startup", "corporation", "inc", "ltd",
    ],
    "preference": [
        "prefers", "likes", "favorite", "usually", "tends to",
        "style", "enjoys", "dislikes", "avoids",
    ],
    "technical_fact": [
        "version", "API", "endpoint", "stack", "framework",
        "library", "database", "protocol", "SDK", "runtime",
    ],
    "policy": [
        "policy", "rule", "compliance", "regulation", "requirement",
        "must", "shall not", "prohibited", "mandatory",
    ],
    "relationship": [
        "reports to", "works with", "partner", "client", "vendor",
        "supplier", "colleague", "team", "department",
    ],
    "temporal": [
        "deadline", "due date", "scheduled", "planned for",
        "expires", "renewal", "until", "by date",
    ],
    "quantitative": [
        "count", "total", "percentage", "ratio", "metric",
        "KPI", "headcount", "budget", "target",
    ],
}

# Default staleness curves (days) per fact type
DEFAULT_STALENESS_DAYS: dict[str, float] = {
    "job_title": 365,
    "pricing": 90,
    "address": 730,
    "preference": 180,
    "company_info": 180,
    "technical_fact": 365,
    "policy": 90,
    "relationship": 180,
    "temporal": 30,
    "quantitative": 90,
    "other": 180,
}


def classify_fact_type(content: str) -> tuple[str, float]:
    """Classify memory content into a fact-type using pattern matching.

    Returns (fact_type, confidence).
    """
    content_lower = content.lower()
    scores: dict[str, int] = {}

    for fact_type, patterns in FACT_TYPE_PATTERNS.items():
        score = 0
        for pattern in patterns:
            if re.search(pattern, content_lower, re.IGNORECASE):
                score += 1
        if score > 0:
            scores[fact_type] = score

    if not scores:
        return "other", 0.3

    best_type = max(scores, key=scores.get)  # type: ignore[arg-type]
    best_score = scores[best_type]
    total_patterns = len(FACT_TYPE_PATTERNS[best_type])
    confidence = min(1.0, best_score / max(total_patterns * 0.3, 1))

    return best_type, round(confidence, 2)


def get_fact_type_volatility(fact_type: Optional[str]) -> float:
    """Return volatility score (0-1) for a fact type. Higher = changes faster."""
    staleness_days = DEFAULT_STALENESS_DAYS.get(fact_type or "other", 180)
    # Normalize: 30 days (most volatile) = 1.0, 730 days (least) = 0.0
    return round(max(0.0, min(1.0, 1 - (staleness_days - 30) / 700)), 4)
