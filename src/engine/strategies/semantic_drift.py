import json
from datetime import UTC, datetime

import anthropic
import structlog

from src.config import settings
from src.engine.prompts import SEMANTIC_DRIFT_PROMPT

logger = structlog.get_logger()


async def validate_semantic_drift(
    memory_content: str,
    memory_created_at: datetime,
    recent_context: list[str],
    n_sessions: int = 5,
) -> dict:
    """Detect semantic drift by using an LLM to assess whether recent context
    contradicts or suggests staleness of a stored memory.

    Args:
        memory_content: The stored memory text to validate.
        memory_created_at: When the memory was originally recorded.
        recent_context: List of recent agent interaction summaries.
        n_sessions: Number of recent sessions the context spans.

    Returns:
        {
            "outcome": "verified" | "flagged" | "quarantined" | "error",
            "contradicted": bool,
            "likely_stale": bool,
            "confidence": float,
            "reasoning": str,
        }
    """
    if not settings.anthropic_api_key:
        logger.warning("semantic_drift.no_api_key", memory_content=memory_content[:80])
        return _result(
            outcome="error",
            reasoning="Anthropic API key not configured",
        )

    if not recent_context:
        logger.info("semantic_drift.no_recent_context", memory_content=memory_content[:80])
        return _result(
            outcome="verified",
            confidence=0.4,
            reasoning="No recent context available to check against; assuming still valid",
        )

    now = datetime.now(UTC)
    days_ago = max(0, (now - memory_created_at).days)
    context_summary = "\n---\n".join(recent_context[:20])  # Cap context length

    prompt = SEMANTIC_DRIFT_PROMPT.format(
        days_ago=days_ago,
        memory_content=memory_content,
        n_sessions=n_sessions,
        recent_context_summary=context_summary,
    )

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=settings.memguard_llm_model,
            max_tokens=settings.memguard_llm_max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError:
        logger.warning("semantic_drift.rate_limited")
        return _result(outcome="error", reasoning="LLM rate limit exceeded; retry later")
    except anthropic.APIError as e:
        logger.error("semantic_drift.api_error", error=str(e))
        return _result(outcome="error", reasoning=f"LLM API error: {e}")
    except Exception as e:
        logger.error("semantic_drift.unexpected_error", error=str(e))
        return _result(outcome="error", reasoning=f"Unexpected error: {e}")

    # Parse the LLM response
    raw_text = response.content[0].text if response.content else ""
    parsed = _parse_llm_response(raw_text)

    if parsed is None:
        logger.warning("semantic_drift.parse_failed", raw_text=raw_text[:200])
        return _result(
            outcome="error",
            reasoning=f"Failed to parse LLM response: {raw_text[:200]}",
        )

    contradicted = bool(parsed.get("contradicted", False))
    likely_stale = bool(parsed.get("likely_stale", False))
    confidence = float(parsed.get("confidence", 0.5))
    reasoning = str(parsed.get("reasoning", ""))

    # Determine outcome based on LLM assessment
    if contradicted:
        outcome = "quarantined"
    elif likely_stale or confidence < 0.5:
        outcome = "flagged"
    else:
        outcome = "verified"

    logger.info(
        "semantic_drift.completed",
        outcome=outcome,
        contradicted=contradicted,
        likely_stale=likely_stale,
        confidence=confidence,
        memory_content=memory_content[:80],
    )

    return {
        "outcome": outcome,
        "contradicted": contradicted,
        "likely_stale": likely_stale,
        "confidence": round(confidence, 4),
        "reasoning": reasoning,
    }


def _parse_llm_response(text: str) -> dict | None:
    """Extract JSON from the LLM response text, tolerating markdown fences."""
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object within the text
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return None


def _result(
    outcome: str = "error",
    contradicted: bool = False,
    likely_stale: bool = False,
    confidence: float = 0.5,
    reasoning: str = "",
) -> dict:
    return {
        "outcome": outcome,
        "contradicted": contradicted,
        "likely_stale": likely_stale,
        "confidence": confidence,
        "reasoning": reasoning,
    }
