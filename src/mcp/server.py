"""MemGuard MCP Server.

Exposes MemGuard validation tools that AI agents can call natively
via the Model Context Protocol (MCP). Tools allow agents to check
memory trustworthiness before acting on stored facts.
"""

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool
from sqlalchemy import func, select

from mcp.server import Server
from src.api.deps import async_session_factory
from src.models import MemoryRecord, ValidationJob, ValidationResult

# Hardcoded tenant ID for single-tenant mode.
# TODO: Replace with proper tenant resolution from MCP auth context.
DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

server = Server("memguard")


def _isoformat(dt: datetime | None) -> str | None:
    """Convert a datetime to ISO 8601 string, or return None."""
    return dt.isoformat() if dt else None


@server.list_tools()
async def list_tools() -> list[Tool]:
    """Return the list of tools exposed by the MemGuard MCP server."""
    return [
        Tool(
            name="validate_memory",
            description=(
                "Check if a specific memory is still accurate before acting on it. "
                "Returns trust score and validation status. Call this before making "
                "decisions based on stored facts that might be outdated."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "string",
                        "description": "The UUID of the memory to validate.",
                    },
                    "strategy": {
                        "type": "string",
                        "enum": ["source_linked", "semantic", "quick"],
                        "default": "quick",
                        "description": (
                            "Validation strategy. 'quick' checks trust score and recent "
                            "validation status without running a new validation. "
                            "'source_linked' re-fetches from the original source. "
                            "'semantic' uses LLM-based drift detection."
                        ),
                    },
                },
                "required": ["memory_id"],
            },
        ),
        Tool(
            name="get_memory_health",
            description=(
                "Get overall health metrics for the agent's memory store. "
                "Use this to assess how reliable the current memory state is."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "connector_id": {
                        "type": "string",
                        "description": "Optional UUID of a specific connector to check.",
                    },
                },
                "required": [],
            },
        ),
        Tool(
            name="report_stale_memory",
            description=(
                "Report a memory that the agent suspects is stale based on new "
                "information encountered during a task. This triggers priority validation."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "string",
                        "description": "The UUID of the suspected stale memory.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why the agent suspects this memory is stale.",
                    },
                    "contradicting_evidence": {
                        "type": "string",
                        "description": "Optional new information that contradicts the memory.",
                    },
                },
                "required": ["memory_id", "reason"],
            },
        ),
        Tool(
            name="get_trusted_memories",
            description=(
                "Retrieve only memories above a trust score threshold. Use instead "
                "of raw memory retrieval when accuracy is critical."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Semantic search query to filter memories by content.",
                    },
                    "min_trust_score": {
                        "type": "number",
                        "default": 0.7,
                        "description": "Minimum trust score threshold (0.0 to 1.0).",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 10,
                        "description": "Maximum number of results to return.",
                    },
                },
                "required": ["query"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Dispatch MCP tool calls to the appropriate handler."""
    handlers = {
        "validate_memory": _handle_validate_memory,
        "get_memory_health": _handle_get_memory_health,
        "report_stale_memory": _handle_report_stale_memory,
        "get_trusted_memories": _handle_get_trusted_memories,
    }

    handler = handlers.get(name)
    if handler is None:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]

    try:
        result = await handler(arguments)
        return [TextContent(type="text", text=_serialize_result(result))]
    except ValueError as exc:
        return [TextContent(type="text", text=f"Invalid input: {exc}")]
    except Exception as exc:
        return [TextContent(type="text", text=f"Error: {exc}")]


def _serialize_result(data: Any) -> str:
    """Serialize a result dict to a JSON-formatted string."""
    import json
    return json.dumps(data, indent=2, default=str)


async def _handle_validate_memory(arguments: dict[str, Any]) -> dict[str, Any]:
    """Check if a specific memory is still accurate.

    For the 'quick' strategy, returns the current trust score and validation
    status without triggering a new validation run. For other strategies,
    creates a priority validation job and returns the job ID alongside
    current state.

    Args:
        arguments: Must contain 'memory_id'. Optionally 'strategy'.

    Returns:
        Dict with trust_score, status, last_validated_at, and evidence.
    """
    memory_id_str = arguments.get("memory_id")
    if not memory_id_str:
        raise ValueError("memory_id is required")

    memory_id = uuid.UUID(memory_id_str)
    strategy = arguments.get("strategy", "quick")

    async with async_session_factory() as session:
        stmt = select(MemoryRecord).where(
            MemoryRecord.id == memory_id,
            MemoryRecord.tenant_id == DEFAULT_TENANT_ID,
        )
        result = await session.execute(stmt)
        memory = result.scalar_one_or_none()

        if memory is None:
            return {
                "trust_score": 0.0,
                "status": "unknown",
                "last_validated_at": None,
                "evidence": "Memory not found in MemGuard tracking.",
            }

        response: dict[str, Any] = {
            "trust_score": memory.trust_score,
            "status": memory.status,
            "last_validated_at": _isoformat(memory.last_validated_at),
            "evidence": None,
        }

        # Attach the most recent validation result evidence if available.
        latest_result_stmt = (
            select(ValidationResult)
            .where(ValidationResult.memory_id == memory_id)
            .order_by(ValidationResult.created_at.desc())
            .limit(1)
        )
        latest_result = (await session.execute(latest_result_stmt)).scalar_one_or_none()
        if latest_result is not None:
            response["evidence"] = latest_result.evidence.get("reasoning") if latest_result.evidence else None

        # For non-quick strategies, create a validation job to run asynchronously.
        if strategy != "quick":
            job = ValidationJob(
                tenant_id=DEFAULT_TENANT_ID,
                connector_id=memory.connector_id,
                job_type=strategy,
                status="pending",
                priority=1,  # Highest priority for on-demand validation.
                config={"memory_ids": [str(memory_id)]},
                total_memories=1,
            )
            session.add(job)
            await session.commit()
            response["validation_job_id"] = str(job.id)
            response["message"] = f"Validation job created with strategy '{strategy}'."

        return response


async def _handle_get_memory_health(arguments: dict[str, Any]) -> dict[str, Any]:
    """Get overall health metrics for the agent's memory store.

    Args:
        arguments: Optionally contains 'connector_id' to scope to a single connector.

    Returns:
        Dict with total_memories, verified_pct, flagged_count, quarantined_count,
        avg_trust_score, and oldest_unvalidated_days.
    """
    connector_id: uuid.UUID | None = None
    if arguments.get("connector_id"):
        connector_id = uuid.UUID(arguments["connector_id"])

    async with async_session_factory() as session:
        base_filter = [MemoryRecord.tenant_id == DEFAULT_TENANT_ID]
        if connector_id is not None:
            base_filter.append(MemoryRecord.connector_id == connector_id)

        # Total memories.
        total_stmt = select(func.count(MemoryRecord.id)).where(*base_filter)
        total_memories: int = (await session.execute(total_stmt)).scalar_one()

        if total_memories == 0:
            return {
                "total_memories": 0,
                "verified_pct": 0.0,
                "flagged_count": 0,
                "quarantined_count": 0,
                "avg_trust_score": 0.0,
                "oldest_unvalidated_days": 0,
            }

        # Count by status.
        status_stmt = (
            select(MemoryRecord.status, func.count(MemoryRecord.id))
            .where(*base_filter)
            .group_by(MemoryRecord.status)
        )
        status_rows = (await session.execute(status_stmt)).all()
        status_counts: dict[str, int] = {row[0]: row[1] for row in status_rows}

        flagged_count = status_counts.get("flagged", 0)
        quarantined_count = status_counts.get("quarantined", 0)

        # Verified percentage: active memories that have been validated at least once.
        verified_stmt = select(func.count(MemoryRecord.id)).where(
            *base_filter,
            MemoryRecord.status == "active",
            MemoryRecord.last_validated_at.isnot(None),
        )
        verified_count: int = (await session.execute(verified_stmt)).scalar_one()
        verified_pct = round((verified_count / total_memories) * 100, 2) if total_memories > 0 else 0.0

        # Average trust score.
        avg_stmt = select(func.avg(MemoryRecord.trust_score)).where(*base_filter)
        avg_trust: float = (await session.execute(avg_stmt)).scalar_one() or 0.0

        # Oldest unvalidated memory (days since last_validated_at, or since created_at if never validated).
        now = datetime.now(UTC)
        oldest_stmt = (
            select(func.min(func.coalesce(MemoryRecord.last_validated_at, MemoryRecord.created_at)))
            .where(*base_filter)
        )
        oldest_dt: datetime | None = (await session.execute(oldest_stmt)).scalar_one()
        oldest_unvalidated_days = (now - oldest_dt).days if oldest_dt else 0

        return {
            "total_memories": total_memories,
            "verified_pct": verified_pct,
            "flagged_count": flagged_count,
            "quarantined_count": quarantined_count,
            "avg_trust_score": round(float(avg_trust), 4),
            "oldest_unvalidated_days": oldest_unvalidated_days,
        }


async def _handle_report_stale_memory(arguments: dict[str, Any]) -> dict[str, Any]:
    """Report a suspected stale memory and trigger priority validation.

    Flags the memory status and creates a high-priority validation job
    so the scheduler picks it up immediately.

    Args:
        arguments: Must contain 'memory_id' and 'reason'. Optionally
            'contradicting_evidence'.

    Returns:
        Dict with acknowledged (bool) and validation_job_id (str).
    """
    memory_id_str = arguments.get("memory_id")
    reason = arguments.get("reason")
    if not memory_id_str:
        raise ValueError("memory_id is required")
    if not reason:
        raise ValueError("reason is required")

    memory_id = uuid.UUID(memory_id_str)
    contradicting_evidence: str | None = arguments.get("contradicting_evidence")

    async with async_session_factory() as session:
        stmt = select(MemoryRecord).where(
            MemoryRecord.id == memory_id,
            MemoryRecord.tenant_id == DEFAULT_TENANT_ID,
        )
        result = await session.execute(stmt)
        memory = result.scalar_one_or_none()

        if memory is None:
            return {
                "acknowledged": False,
                "validation_job_id": None,
                "message": "Memory not found in MemGuard tracking.",
            }

        # Flag the memory if it is currently active.
        if memory.status == "active":
            memory.status = "flagged"

        # Create a high-priority validation job.
        job_config: dict[str, Any] = {
            "memory_ids": [str(memory_id)],
            "report_reason": reason,
        }
        if contradicting_evidence:
            job_config["contradicting_evidence"] = contradicting_evidence

        job = ValidationJob(
            tenant_id=DEFAULT_TENANT_ID,
            connector_id=memory.connector_id,
            job_type="source_linked",
            status="pending",
            priority=1,  # Highest priority.
            config=job_config,
            total_memories=1,
        )
        session.add(job)
        await session.commit()

        return {
            "acknowledged": True,
            "validation_job_id": str(job.id),
        }


async def _handle_get_trusted_memories(arguments: dict[str, Any]) -> dict[str, Any]:
    """Retrieve memories above a trust score threshold.

    Performs a case-insensitive content search filtered by minimum trust
    score. For production use, this should be replaced with proper
    embedding-based semantic search.

    Args:
        arguments: Must contain 'query'. Optionally 'min_trust_score' and 'limit'.

    Returns:
        Dict with a 'memories' list, each containing id, content, trust_score,
        fact_type, status, and last_validated_at.
    """
    query = arguments.get("query")
    if not query:
        raise ValueError("query is required")

    min_trust_score: float = float(arguments.get("min_trust_score", 0.7))
    limit: int = int(arguments.get("limit", 10))

    async with async_session_factory() as session:
        # Simple ILIKE search on content. In production, this should use
        # pgvector similarity search against embeddings.
        stmt = (
            select(MemoryRecord)
            .where(
                MemoryRecord.tenant_id == DEFAULT_TENANT_ID,
                MemoryRecord.trust_score >= min_trust_score,
                MemoryRecord.status.in_(["active", "flagged"]),
                MemoryRecord.content.ilike(f"%{query}%"),
            )
            .order_by(MemoryRecord.trust_score.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        memories = result.scalars().all()

        return {
            "memories": [
                {
                    "id": str(m.id),
                    "content": m.content,
                    "trust_score": m.trust_score,
                    "fact_type": m.fact_type,
                    "status": m.status,
                    "last_validated_at": _isoformat(m.last_validated_at),
                }
                for m in memories
            ],
        }


async def main() -> None:
    """Run the MemGuard MCP server over stdio transport."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
