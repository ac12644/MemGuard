from typing import Optional
from urllib.parse import urlparse

import httpx
import structlog

from src.config import settings
from src.engine.fact_classifier import classify_fact_type
from src.utils.rate_limiter import RateLimiter

logger = structlog.get_logger()

rate_limiter = RateLimiter(max_per_second=settings.memguard_source_rate_limit_per_domain)

# Mapping from fact types to potential cross-reference source templates.
# Each entry is a list of dicts with ``url_template`` (may contain ``{query}``)
# and a ``name`` label.  In production these would be replaced by real API
# integrations; the templates here are illustrative and safe for unit tests to
# override via dependency injection.
CROSS_REFERENCE_SOURCES: dict[str, list[dict]] = {
    "job_title": [
        {"name": "linkedin", "url_template": "https://api.linkedin.com/v2/people?q={query}"},
        {"name": "company_directory", "url_template": "https://api.company-directory.example.com/lookup?q={query}"},
    ],
    "pricing": [
        {"name": "product_page", "url_template": "https://api.pricing-tracker.example.com/check?q={query}"},
        {"name": "competitor_data", "url_template": "https://api.price-compare.example.com/lookup?q={query}"},
    ],
    "address": [
        {"name": "google_maps", "url_template": "https://maps.googleapis.com/maps/api/geocode/json?address={query}"},
        {"name": "company_website", "url_template": "https://api.address-verify.example.com/verify?q={query}"},
    ],
    "company_info": [
        {"name": "crunchbase", "url_template": "https://api.crunchbase.com/v4/entities?query={query}"},
        {"name": "sec_filings", "url_template": "https://efts.sec.gov/LATEST/search-index?q={query}"},
    ],
}


async def validate_cross_reference(
    memory_content: str,
    fact_type: Optional[str] = None,
    custom_sources: Optional[list[dict]] = None,
    auth_headers: Optional[dict] = None,
) -> dict:
    """Verify a memory by querying multiple independent sources and checking
    agreement.

    Args:
        memory_content: The stored memory text to validate.
        fact_type: Pre-classified fact type.  If ``None`` the classifier is
            invoked automatically.
        custom_sources: Optional override list of source dicts, each with
            ``name`` and ``url_template`` keys.
        auth_headers: Optional HTTP headers (e.g. API keys) added to every
            request.

    Returns:
        {
            "outcome": "verified" | "flagged" | "error",
            "sources_checked": list[str],
            "agreement_ratio": float,
            "contradicting_sources": list[str],
            "confidence": float,
            "reasoning": str,
        }
    """
    if fact_type is None:
        fact_type, _ = classify_fact_type(memory_content)

    sources = custom_sources or CROSS_REFERENCE_SOURCES.get(fact_type, [])

    if not sources:
        logger.info(
            "cross_reference.no_sources",
            fact_type=fact_type,
            memory_content=memory_content[:80],
        )
        return _result(
            outcome="error",
            reasoning=f"No cross-reference sources configured for fact type '{fact_type}'",
        )

    # Query each source in turn
    source_results: list[dict] = []
    for source in sources[:3]:  # Cap at 3 sources per spec
        result = await _query_source(source, memory_content, auth_headers)
        source_results.append(result)

    checked_names = [r["name"] for r in source_results]
    successful = [r for r in source_results if r["status"] == "ok"]
    agreeing = [r for r in successful if r["agrees"]]
    contradicting = [r["name"] for r in successful if not r["agrees"]]

    if not successful:
        logger.warning("cross_reference.all_sources_failed", sources=checked_names)
        return _result(
            outcome="error",
            sources_checked=checked_names,
            reasoning="All cross-reference sources failed or returned errors",
        )

    agreement_ratio = len(agreeing) / len(successful) if successful else 0.0

    # Confidence scales with the number of successful sources
    base_confidence = 0.5 + 0.15 * len(successful)
    confidence = min(1.0, base_confidence)

    if agreement_ratio >= 0.5:
        outcome = "verified"
        reasoning = (
            f"{len(agreeing)}/{len(successful)} sources agree with stored memory"
        )
    else:
        outcome = "flagged"
        reasoning = (
            f"Majority of sources contradict stored memory: "
            f"{contradicting} disagree (agreement ratio {agreement_ratio:.2f})"
        )

    logger.info(
        "cross_reference.completed",
        outcome=outcome,
        agreement_ratio=round(agreement_ratio, 4),
        sources_checked=checked_names,
        contradicting=contradicting,
        memory_content=memory_content[:80],
    )

    return {
        "outcome": outcome,
        "sources_checked": checked_names,
        "agreement_ratio": round(agreement_ratio, 4),
        "contradicting_sources": contradicting,
        "confidence": round(confidence, 4),
        "reasoning": reasoning,
    }


async def _query_source(
    source: dict,
    memory_content: str,
    auth_headers: Optional[dict],
) -> dict:
    """Fetch a single cross-reference source and compare with memory content."""
    name = source.get("name", "unknown")
    url_template = source.get("url_template", "")

    # Build the query — use first 120 chars of memory as search query
    query = memory_content[:120].strip()
    url = url_template.replace("{query}", _url_encode(query))

    domain = _extract_domain(url)
    await rate_limiter.acquire(domain)

    try:
        async with httpx.AsyncClient(
            timeout=settings.memguard_source_fetch_timeout,
            headers={"User-Agent": "MemGuard/1.0 (memory-validation-service)"},
        ) as client:
            if auth_headers:
                client.headers.update(auth_headers)
            response = await client.get(url)
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning("cross_reference.source_failed", source=name, error=str(e))
        return {"name": name, "status": "error", "agrees": False}
    except Exception as e:
        logger.warning("cross_reference.source_error", source=name, error=str(e))
        return {"name": name, "status": "error", "agrees": False}

    if response.status_code >= 400:
        logger.warning(
            "cross_reference.source_http_error",
            source=name,
            status_code=response.status_code,
        )
        return {"name": name, "status": "error", "agrees": False}

    # Extract text from the response for comparison
    try:
        data = response.json()
        source_text = _flatten_json_values(data)
    except Exception:
        source_text = response.text

    agrees = _content_matches(memory_content, source_text)
    return {"name": name, "status": "ok", "agrees": agrees}


def _content_matches(memory: str, source_text: str) -> bool:
    """Simple string-overlap check between memory content and source text.

    Compares normalised word sets and checks whether a significant portion of
    the memory's key words appear in the source response.
    """
    memory_words = set(memory.lower().split())
    source_words = set(source_text.lower().split())

    # Remove common stop words for a more meaningful comparison
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "and",
        "but", "or", "nor", "not", "so", "yet", "both", "either", "neither",
        "this", "that", "these", "those", "it", "its",
    }

    memory_keywords = memory_words - stop_words
    if not memory_keywords:
        return False

    overlap = memory_keywords & source_words
    ratio = len(overlap) / len(memory_keywords)
    return ratio >= 0.4


def _flatten_json_values(data, max_depth: int = 3) -> str:
    """Recursively extract all string values from a JSON structure."""
    if max_depth <= 0:
        return str(data)[:500]

    parts: list[str] = []
    if isinstance(data, dict):
        for v in data.values():
            parts.append(_flatten_json_values(v, max_depth - 1))
    elif isinstance(data, list):
        for item in data[:20]:  # Cap list traversal
            parts.append(_flatten_json_values(item, max_depth - 1))
    else:
        parts.append(str(data))

    return " ".join(parts)[:2000]


def _extract_domain(url: str) -> str:
    return urlparse(url).netloc


def _url_encode(text: str) -> str:
    from urllib.parse import quote_plus
    return quote_plus(text)


def _result(
    outcome: str = "error",
    sources_checked: Optional[list[str]] = None,
    agreement_ratio: float = 0.0,
    contradicting_sources: Optional[list[str]] = None,
    confidence: float = 0.5,
    reasoning: str = "",
) -> dict:
    return {
        "outcome": outcome,
        "sources_checked": sources_checked or [],
        "agreement_ratio": agreement_ratio,
        "contradicting_sources": contradicting_sources or [],
        "confidence": confidence,
        "reasoning": reasoning,
    }
