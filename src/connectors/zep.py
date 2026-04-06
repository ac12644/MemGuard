from datetime import datetime
from typing import Optional

import httpx
import structlog

from src.connectors.base import BaseConnector, MemoryItem, MemoryUpdate

logger = structlog.get_logger()

ZEP_API_BASE = "https://api.getzep.com/api/v2"


class ZepConnector(BaseConnector):
    """Adapter for Zep Cloud API.

    Zep stores memories as a knowledge graph. This connector fetches:
    - Graph edges (facts/relationships between entities)
    - Episodes (raw conversation content)

    Config:
        api_key: Zep API key (required)
        user_id: User ID to scope graph searches (optional but recommended)
        group_id: Group ID for shared graphs (optional)
        base_url: Override API base URL (optional, for self-hosted)
    """

    def __init__(self, config: dict) -> None:
        self.api_key: str = config["api_key"]
        self.base_url: str = config.get("base_url", ZEP_API_BASE)
        self.user_id: Optional[str] = config.get("user_id")
        self.group_id: Optional[str] = config.get("group_id")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Api-Key {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def connect(self, config: dict) -> bool:
        """Test connection by listing threads."""
        try:
            resp = await self.client.get("/threads", params={"page_size": 1})
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error("zep_connection_failed", error=str(e))
            return False

    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: Optional[dict] = None,
    ) -> list[MemoryItem]:
        """Fetch facts from Zep's knowledge graph via search.

        Uses graph search to retrieve edges (facts) which are the closest
        analog to "memories" in Zep's architecture.
        """
        # First try graph search for structured facts
        facts = await self._fetch_graph_facts(limit)
        if facts:
            return facts[offset:offset + limit]

        # Fallback: fetch threads and extract content
        return await self._fetch_from_threads(limit, offset)

    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a single fact by searching for it."""
        # Zep doesn't have a direct get-by-id for edges in the public API,
        # so we search for it
        try:
            payload: dict = {"query": external_id, "limit": 1, "scope": "edges"}
            if self.user_id:
                payload["user_id"] = self.user_id
            if self.group_id:
                payload["graph_id"] = self.group_id

            resp = await self.client.post("/graph/search", json=payload)
            resp.raise_for_status()
            data = resp.json()

            edges = data.get("edges", [])
            if edges:
                return self._edge_to_memory_item(edges[0])
            return None
        except Exception as e:
            logger.error("zep_fetch_by_id_failed", external_id=external_id, error=str(e))
            return None

    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Zep's graph is managed by the system — limited writeback support."""
        # Zep doesn't expose a general-purpose update API for edges/facts.
        # Trust scores are stored only in MemGuard's DB.
        logger.info("zep_writeback_skipped", reason="Zep graph is system-managed")
        return False

    async def get_memory_count(self) -> int:
        """Estimate memory count from threads."""
        try:
            resp = await self.client.get("/threads", params={"page_size": 1})
            resp.raise_for_status()
            data = resp.json()
            return data.get("total_count", 0)
        except Exception as e:
            logger.error("zep_count_failed", error=str(e))
            return 0

    def supports_writeback(self) -> bool:
        return False

    def supports_source_metadata(self) -> bool:
        return False

    # --- Internal methods ---

    async def _fetch_graph_facts(self, limit: int) -> list[MemoryItem]:
        """Fetch facts from Zep's knowledge graph as edges."""
        try:
            payload: dict = {
                "query": "*",
                "limit": min(limit, 50),
                "scope": "edges",
            }
            if self.user_id:
                payload["user_id"] = self.user_id
            if self.group_id:
                payload["graph_id"] = self.group_id

            resp = await self.client.post("/graph/search", json=payload)
            resp.raise_for_status()
            data = resp.json()

            edges = data.get("edges", [])
            return [self._edge_to_memory_item(e) for e in edges]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.info("zep_graph_not_found", detail="No graph data yet")
                return []
            logger.error("zep_graph_search_failed", status=e.response.status_code, error=str(e))
            return []
        except Exception as e:
            logger.error("zep_graph_search_failed", error=str(e))
            return []

    async def _fetch_from_threads(self, limit: int, offset: int) -> list[MemoryItem]:
        """Fallback: fetch threads as memory items."""
        try:
            page = (offset // max(limit, 1)) + 1
            resp = await self.client.get("/threads", params={
                "page_size": limit,
                "page_number": page,
                "order_by": "updated_at",
                "asc": False,
            })
            resp.raise_for_status()
            data = resp.json()

            threads = data.get("threads", [])
            return [self._thread_to_memory_item(t) for t in threads]
        except Exception as e:
            logger.error("zep_threads_fetch_failed", error=str(e))
            return []

    def _edge_to_memory_item(self, edge: dict) -> MemoryItem:
        """Convert a Zep graph edge (fact) to a MemoryItem."""
        fact = edge.get("fact", edge.get("name", ""))
        uuid = edge.get("uuid", edge.get("id", ""))

        return MemoryItem(
            external_id=str(uuid),
            content=fact,
            metadata={
                "source_node_uuid": edge.get("source_node_uuid"),
                "target_node_uuid": edge.get("target_node_uuid"),
                "episodes": edge.get("episodes", []),
                "score": edge.get("score"),
                "edge_type": edge.get("relation_type", edge.get("type")),
            },
            source_type="knowledge_graph",
            created_at=_parse_dt(edge.get("created_at")),
            updated_at=_parse_dt(edge.get("updated_at")),
            user_id=self.user_id,
        )

    def _thread_to_memory_item(self, thread: dict) -> MemoryItem:
        """Convert a Zep thread to a MemoryItem."""
        return MemoryItem(
            external_id=thread.get("uuid", thread.get("thread_id", "")),
            content=f"Thread: {thread.get('thread_id', 'unknown')}",
            metadata={
                "thread_id": thread.get("thread_id"),
                "project_uuid": thread.get("project_uuid"),
            },
            source_type="thread",
            created_at=_parse_dt(thread.get("created_at")),
            user_id=thread.get("user_id"),
        )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
