from datetime import datetime
from typing import Any

import httpx
import structlog

from src.connectors.base import BaseConnector, MemoryItem, MemoryUpdate

logger = structlog.get_logger()


class GenericRESTConnector(BaseConnector):
    """Webhook-based generic adapter for arbitrary memory systems.

    Config schema:
    {
        "base_url": "https://my-memory-system.com/api",
        "auth_header": "Authorization",
        "auth_value": "Bearer ...",
        "endpoints": {
            "list": {"method": "GET", "path": "/memories", "response_key": "data"},
            "get": {"method": "GET", "path": "/memories/{id}"},
            "update": {"method": "PUT", "path": "/memories/{id}"},
            "count": {"method": "GET", "path": "/memories/count", "response_key": "total"}
        },
        "field_mapping": {
            "id": "id",
            "content": "text",
            "created_at": "created_at",
            "updated_at": "updated_at",
            "metadata": "meta"
        }
    }
    """

    def __init__(self, config: dict) -> None:
        self.base_url: str = config["base_url"]
        self.auth_header: str = config.get("auth_header", "Authorization")
        self.auth_value: str = config.get("auth_value", "")
        self.endpoints: dict = config.get("endpoints", {})
        self.field_mapping: dict = config.get("field_mapping", {
            "id": "id",
            "content": "content",
            "created_at": "created_at",
            "updated_at": "updated_at",
            "metadata": "metadata",
        })
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers: dict = {}
            if self.auth_value:
                headers[self.auth_header] = self.auth_value
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=30.0,
            )
        return self._client

    async def connect(self, config: dict) -> bool:
        try:
            ep = self.endpoints.get("list", {"method": "GET", "path": "/memories"})
            resp = await self.client.request(ep["method"], ep["path"], params={"limit": 1})
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error("generic_rest_connection_failed", error=str(e))
            return False

    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: dict | None = None,
    ) -> list[MemoryItem]:
        ep = self.endpoints.get("list", {"method": "GET", "path": "/memories"})
        params: dict = {"limit": limit, "offset": offset}
        if filters:
            params.update(filters)

        resp = await self.client.request(ep["method"], ep["path"], params=params)
        resp.raise_for_status()
        data = resp.json()

        response_key = ep.get("response_key")
        items = data[response_key] if response_key and isinstance(data, dict) else data
        if not isinstance(items, list):
            items = []

        return [self._to_memory_item(m) for m in items]

    async def fetch_memory_by_id(self, external_id: str) -> MemoryItem | None:
        ep = self.endpoints.get("get", {"method": "GET", "path": "/memories/{id}"})
        path = ep["path"].replace("{id}", external_id)
        try:
            resp = await self.client.request(ep["method"], path)
            resp.raise_for_status()
            return self._to_memory_item(resp.json())
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        ep = self.endpoints.get("update")
        if not ep:
            return False

        for update in updates:
            try:
                path = ep["path"].replace("{id}", update.external_id)
                payload: dict = {}
                if update.trust_score is not None:
                    payload["trust_score"] = update.trust_score
                if update.status:
                    payload["status"] = update.status
                if update.metadata_updates:
                    payload["metadata"] = update.metadata_updates

                resp = await self.client.request(ep["method"], path, json=payload)
                resp.raise_for_status()
            except Exception as e:
                logger.error("generic_rest_writeback_failed", external_id=update.external_id, error=str(e))
                return False
        return True

    async def get_memory_count(self) -> int:
        ep = self.endpoints.get("count")
        if not ep:
            memories = await self.fetch_memories(limit=1)
            return len(memories)

        resp = await self.client.request(ep["method"], ep["path"])
        resp.raise_for_status()
        data = resp.json()

        response_key = ep.get("response_key", "total")
        return data[response_key] if isinstance(data, dict) else data

    def supports_writeback(self) -> bool:
        return "update" in self.endpoints

    def _to_memory_item(self, raw: dict) -> MemoryItem:
        fm = self.field_mapping
        return MemoryItem(
            external_id=str(_extract(raw, fm.get("id", "id"))),
            content=str(_extract(raw, fm.get("content", "content"), "")),
            metadata=_extract(raw, fm.get("metadata", "metadata"), {}) or {},
            created_at=_parse_dt(_extract(raw, fm.get("created_at", "created_at"))),
            updated_at=_parse_dt(_extract(raw, fm.get("updated_at", "updated_at"))),
        )


def _extract(data: dict, key: str, default: Any = None) -> Any:
    """Extract a value from a dict, supporting dot-notation keys."""
    parts = key.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part, default)
        else:
            return default
    return current


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
