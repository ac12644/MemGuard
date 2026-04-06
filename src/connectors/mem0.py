from datetime import datetime
from typing import Optional

import httpx
import structlog

from src.connectors.base import BaseConnector, MemoryItem, MemoryUpdate

logger = structlog.get_logger()

MEM0_API_BASE = "https://api.mem0.ai/v1"


class Mem0Connector(BaseConnector):
    """Adapter for Mem0 REST API.

    Config:
        api_key: Mem0 API key (required)
        user_id: User ID to scope memories (required by Mem0 API)
        agent_id: Agent ID filter (optional)
        base_url: Override API base URL (optional)
    """

    def __init__(self, config: dict) -> None:
        self.api_key: str = config["api_key"]
        self.base_url: str = config.get("base_url", MEM0_API_BASE)
        self.user_id: Optional[str] = config.get("user_id")
        self.agent_id: Optional[str] = config.get("agent_id")
        self._client: Optional[httpx.AsyncClient] = None

    def _require_filter(self) -> dict:
        """Mem0 requires at least one of: user_id, agent_id, app_id, run_id."""
        params: dict = {}
        if self.user_id:
            params["user_id"] = self.user_id
        if self.agent_id:
            params["agent_id"] = self.agent_id
        if not params:
            raise ValueError("Mem0 requires at least user_id or agent_id in config")
        return params

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Token {self.api_key}"},
                timeout=30.0,
            )
        return self._client

    async def connect(self, config: dict) -> bool:
        """Test connection by fetching memories."""
        try:
            params = self._require_filter()
            resp = await self.client.get("/memories/", params=params)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error("mem0_connection_failed", error=str(e))
            return False

    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: Optional[dict] = None,
    ) -> list[MemoryItem]:
        """Fetch memories from Mem0 API."""
        params = self._require_filter()

        resp = await self.client.get("/memories/", params=params)
        resp.raise_for_status()
        data = resp.json()

        # Mem0 returns a flat list of memories
        memories = data if isinstance(data, list) else data.get("results", data.get("memories", []))
        # Apply limit/offset client-side (Mem0 API returns all)
        return [self._to_memory_item(m) for m in memories[offset:offset + limit]]

    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a single memory by ID."""
        try:
            resp = await self.client.get(f"/memories/{external_id}/")
            resp.raise_for_status()
            return self._to_memory_item(resp.json())
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Write trust scores back via metadata updates."""
        for update in updates:
            try:
                payload: dict = {}
                if update.metadata_updates:
                    payload["metadata"] = update.metadata_updates
                if update.trust_score is not None:
                    payload.setdefault("metadata", {})["memguard_trust_score"] = update.trust_score
                if update.status:
                    payload.setdefault("metadata", {})["memguard_status"] = update.status

                if payload:
                    resp = await self.client.put(f"/memories/{update.external_id}/", json=payload)
                    resp.raise_for_status()
            except Exception as e:
                logger.error("mem0_writeback_failed", external_id=update.external_id, error=str(e))
                return False
        return True

    async def get_memory_count(self) -> int:
        """Return total memory count."""
        params = self._require_filter()
        resp = await self.client.get("/memories/", params=params)
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            return data.get("count", data.get("total", len(data.get("results", []))))
        return 0

    def supports_writeback(self) -> bool:
        return True

    def supports_source_metadata(self) -> bool:
        return False

    def _to_memory_item(self, raw: dict) -> MemoryItem:
        """Convert Mem0 API response to MemoryItem."""
        metadata = raw.get("metadata", {}) or {}
        return MemoryItem(
            external_id=raw["id"],
            content=raw.get("memory", raw.get("content", "")),
            metadata=metadata,
            source_type="api",
            created_at=_parse_dt(raw.get("created_at")),
            updated_at=_parse_dt(raw.get("updated_at")),
            tags=metadata.get("tags", []),
            user_id=raw.get("user_id") or metadata.get("user_id"),
            agent_id=raw.get("agent_id") or metadata.get("agent_id"),
        )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
