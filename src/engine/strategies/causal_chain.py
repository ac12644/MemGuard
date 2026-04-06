import json
from typing import Optional

import anthropic
import structlog

from src.config import settings
from src.engine.prompts import DEPENDENCY_PROMPT

logger = structlog.get_logger()


async def validate_causal_chain(
    memory_content: str,
    memory_id: str,
    neighbor_memories: list[dict],
    max_neighbors: int = 10,
) -> dict:
    """Check whether flagging or quarantining a memory should cascade to
    dependent memories.

    Finds the most related neighbours using simple word overlap, then uses an
    LLM to determine whether a true dependency relationship exists.

    Args:
        memory_content: The content of the memory being validated (Memory A).
        memory_id: The UUID (as string) of the memory being validated.
        neighbor_memories: List of candidate neighbour dicts, each with at
            least ``id`` and ``content`` keys.
        max_neighbors: Maximum number of neighbours to evaluate.

    Returns:
        {
            "outcome": "verified" | "flagged" | "error",
            "dependencies_found": list[dict],
            "cascaded_flags": list[str],
            "confidence": float,
            "reasoning": str,
        }
    """
    if not neighbor_memories:
        logger.info("causal_chain.no_neighbors", memory_id=memory_id)
        return _result(
            outcome="verified",
            confidence=0.6,
            reasoning="No neighbour memories provided; nothing to cascade",
        )

    # Rank neighbours by word overlap and take the top N.
    ranked = _rank_by_word_overlap(memory_content, neighbor_memories)
    candidates = ranked[:max_neighbors]

    if not candidates:
        return _result(
            outcome="verified",
            confidence=0.6,
            reasoning="No neighbours with meaningful content overlap found",
        )

    # If no API key, fall back to overlap-only heuristic (no LLM).
    if not settings.anthropic_api_key:
        logger.warning("causal_chain.no_api_key", memory_id=memory_id)
        return _heuristic_only(memory_content, memory_id, candidates)

    # Evaluate each candidate via LLM.
    dependencies: list[dict] = []
    cascaded_flags: list[str] = []

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    for candidate in candidates:
        dep = await _check_dependency(client, memory_content, candidate)
        if dep is not None and dep.get("depends"):
            dependencies.append({
                "memory_id": candidate["id"],
                "relationship": dep.get("relationship", ""),
                "strength": dep.get("strength", 0.0),
            })
            if dep.get("strength", 0) >= 0.5:
                cascaded_flags.append(candidate["id"])

    if dependencies:
        outcome = "flagged"
        reasoning = (
            f"Found {len(dependencies)} dependent memories; "
            f"{len(cascaded_flags)} flagged for cascade "
            f"(strength >= 0.5)"
        )
        confidence = min(1.0, 0.6 + 0.1 * len(dependencies))
    else:
        outcome = "verified"
        reasoning = (
            f"Checked {len(candidates)} neighbours; no dependency "
            f"relationships detected"
        )
        confidence = 0.7

    logger.info(
        "causal_chain.completed",
        outcome=outcome,
        dependencies_count=len(dependencies),
        cascaded_count=len(cascaded_flags),
        memory_id=memory_id,
    )

    return {
        "outcome": outcome,
        "dependencies_found": dependencies,
        "cascaded_flags": cascaded_flags,
        "confidence": round(confidence, 4),
        "reasoning": reasoning,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _rank_by_word_overlap(
    memory_content: str,
    neighbors: list[dict],
) -> list[dict]:
    """Rank neighbour memories by simple word-overlap similarity with
    ``memory_content``.  Returns a new list sorted descending by overlap
    ratio.
    """
    memory_words = _keyword_set(memory_content)
    if not memory_words:
        return neighbors[:10]

    scored: list[tuple[float, dict]] = []
    for nb in neighbors:
        nb_words = _keyword_set(nb.get("content", ""))
        if not nb_words:
            continue
        overlap = len(memory_words & nb_words) / max(len(memory_words | nb_words), 1)
        if overlap > 0.05:  # Filter out near-zero overlap
            scored.append((overlap, nb))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored]


def _keyword_set(text: str) -> set[str]:
    """Return a set of lowercase keywords, excluding common stop words."""
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "and",
        "but", "or", "nor", "not", "so", "yet", "both", "either", "neither",
        "this", "that", "these", "those", "it", "its",
    }
    words = set(text.lower().split())
    return words - stop_words


async def _check_dependency(
    client: anthropic.AsyncAnthropic,
    memory_a_content: str,
    candidate: dict,
) -> Optional[dict]:
    """Use the LLM to assess whether ``candidate`` depends on ``memory_a_content``."""
    prompt = DEPENDENCY_PROMPT.format(
        memory_a=memory_a_content,
        memory_b=candidate.get("content", ""),
    )

    try:
        response = await client.messages.create(
            model=settings.memguard_llm_model,
            max_tokens=settings.memguard_llm_max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError:
        logger.warning("causal_chain.rate_limited", candidate_id=candidate.get("id"))
        return None
    except anthropic.APIError as e:
        logger.error("causal_chain.api_error", error=str(e), candidate_id=candidate.get("id"))
        return None
    except Exception as e:
        logger.error("causal_chain.unexpected_error", error=str(e))
        return None

    raw_text = response.content[0].text if response.content else ""
    return _parse_llm_response(raw_text)


def _parse_llm_response(text: str) -> Optional[dict]:
    """Extract JSON from the LLM response, tolerating markdown fences."""
    text = text.strip()

    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return None


def _heuristic_only(
    memory_content: str,
    memory_id: str,
    candidates: list[dict],
) -> dict:
    """Fallback when no LLM is available.  Flag neighbours with very high
    word overlap as potential dependencies.
    """
    memory_words = _keyword_set(memory_content)
    dependencies: list[dict] = []
    cascaded_flags: list[str] = []

    for nb in candidates:
        nb_words = _keyword_set(nb.get("content", ""))
        if not nb_words or not memory_words:
            continue
        overlap = len(memory_words & nb_words) / max(len(memory_words | nb_words), 1)
        if overlap >= 0.4:
            dependencies.append({
                "memory_id": nb["id"],
                "relationship": "high word overlap (heuristic)",
                "strength": round(overlap, 4),
            })
            cascaded_flags.append(nb["id"])

    if dependencies:
        outcome = "flagged"
        reasoning = (
            f"Heuristic mode (no LLM): {len(dependencies)} neighbours have "
            f">= 40% word overlap and may depend on this memory"
        )
    else:
        outcome = "verified"
        reasoning = "Heuristic mode (no LLM): no high-overlap neighbours found"

    return {
        "outcome": outcome,
        "dependencies_found": dependencies,
        "cascaded_flags": cascaded_flags,
        "confidence": 0.4,
        "reasoning": reasoning,
    }


def _result(
    outcome: str = "error",
    dependencies_found: Optional[list[dict]] = None,
    cascaded_flags: Optional[list[str]] = None,
    confidence: float = 0.5,
    reasoning: str = "",
) -> dict:
    return {
        "outcome": outcome,
        "dependencies_found": dependencies_found or [],
        "cascaded_flags": cascaded_flags or [],
        "confidence": confidence,
        "reasoning": reasoning,
    }
