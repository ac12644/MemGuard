
import httpx
import structlog

from src.config import settings
from src.utils.rate_limiter import RateLimiter

logger = structlog.get_logger()

rate_limiter = RateLimiter(max_per_second=settings.memguard_source_rate_limit_per_domain)


async def validate_source_linked(
    memory_content: str,
    source_url: str,
    source_field: str | None = None,
    auth_headers: dict | None = None,
) -> dict:
    """Re-fetch the original source and compare against stored memory.

    Returns:
        {
            "outcome": "verified" | "flagged" | "source_unavailable" | "error",
            "source_current_value": str | None,
            "memory_stored_value": str,
            "drift_detected": bool,
            "confidence": float,
            "reasoning": str,
        }
    """
    domain = _extract_domain(source_url)
    await rate_limiter.acquire(domain)

    try:
        async with httpx.AsyncClient(
            timeout=settings.memguard_source_fetch_timeout,
            headers={"User-Agent": "MemGuard/1.0 (memory-validation-service)"},
        ) as client:
            if auth_headers:
                client.headers.update(auth_headers)
            response = await client.get(source_url)
    except httpx.TimeoutException:
        return _result("error", memory_content, reasoning="Source URL timed out")
    except httpx.ConnectError:
        return _result("source_unavailable", memory_content, reasoning="Could not connect to source")
    except Exception as e:
        return _result("error", memory_content, reasoning=f"Fetch error: {e}")

    if response.status_code == 404:
        return _result("source_unavailable", memory_content, reasoning="Source returned 404 (deleted)")
    if response.status_code == 403:
        return _result("error", memory_content, reasoning="Source returned 403 (permission denied)", confidence=0.5)
    if response.status_code >= 400:
        return _result("error", memory_content, reasoning=f"Source returned HTTP {response.status_code}")

    # Extract value from response
    try:
        data = response.json()
        current_value = _extract_field(data, source_field) if source_field else str(data)
    except Exception:
        current_value = response.text

    if current_value is None:
        return _result(
            "flagged", memory_content,
            source_value="(field not found)",
            reasoning=f"Source field '{source_field}' not found in response",
        )

    current_str = str(current_value).strip()
    stored_str = memory_content.strip()

    # Simple comparison first
    if current_str.lower() == stored_str.lower():
        return _result("verified", memory_content, source_value=current_str, confidence=0.95)

    # Check if one contains the other (partial match)
    if current_str.lower() in stored_str.lower() or stored_str.lower() in current_str.lower():
        return _result(
            "verified", memory_content,
            source_value=current_str,
            confidence=0.8,
            reasoning="Partial match detected",
        )

    # Values differ
    return _result(
        "flagged", memory_content,
        source_value=current_str,
        drift_detected=True,
        confidence=0.9,
        reasoning=f"Source now returns '{current_str[:100]}' but memory stores '{stored_str[:100]}'",
    )


def _result(
    outcome: str,
    stored_value: str,
    source_value: str | None = None,
    drift_detected: bool = False,
    confidence: float = 0.5,
    reasoning: str = "",
) -> dict:
    return {
        "outcome": outcome,
        "source_current_value": source_value,
        "memory_stored_value": stored_value,
        "drift_detected": drift_detected,
        "confidence": confidence,
        "reasoning": reasoning,
    }


def _extract_domain(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).netloc


def _extract_field(data: dict, field_path: str):
    """Extract a nested field using dot notation."""
    parts = field_path.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            idx = int(part)
            current = current[idx] if idx < len(current) else None
        else:
            return None
        if current is None:
            return None
    return current
