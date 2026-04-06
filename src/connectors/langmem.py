from datetime import datetime
from typing import Optional

import httpx
import structlog

from src.connectors.base import BaseConnector, MemoryItem, MemoryUpdate

logger = structlog.get_logger()

LANGGRAPH_API_BASE = "https://api.smith.langchain.com"


class LangMemConnector(BaseConnector):
    """Adapter for LangMem / LangGraph Store.

    LangMem stores memories in LangGraph's Store layer as items with:
    - namespace: tuple of strings (e.g. ("user-123", "memories"))
    - key: unique string identifier within namespace
    - value: dict containing the memory data

    This connector accesses LangGraph Platform's Store REST API.
    For self-hosted LangGraph, point base_url to your deployment.

    Config:
        api_key: LangSmith/LangGraph API key (required)
        base_url: LangGraph Platform API URL (required for self-hosted, defaults to LangSmith)
        namespace: Namespace tuple as list, e.g. ["user-123", "memories"] (required)
        assistant_id: LangGraph assistant/deployment ID (optional)
    """

    def __init__(self, config: dict) -> None:
        self.api_key: str = config["api_key"]
        self.base_url: str = config.get("base_url", LANGGRAPH_API_BASE)
        self.namespace: list[str] = config.get("namespace", ["memories"])
        self.assistant_id: Optional[str] = config.get("assistant_id")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "X-Api-Key": self.api_key,
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def connect(self, config: dict) -> bool:
        """Test connection by searching the store."""
        try:
            resp = await self.client.post("/store/search", json={
                "namespace": self.namespace,
                "limit": 1,
            })
            resp.raise_for_status()
            return True
        except httpx.HTTPStatusError as e:
            # Try alternative auth header
            if e.response.status_code == 401:
                self.client.headers["Authorization"] = f"Bearer {self.api_key}"
                del self.client.headers["X-Api-Key"]
                try:
                    resp = await self.client.post("/store/search", json={
                        "namespace": self.namespace,
                        "limit": 1,
                    })
                    resp.raise_for_status()
                    return True
                except Exception:
                    pass
            logger.error("langmem_connection_failed", error=str(e))
            return False
        except Exception as e:
            logger.error("langmem_connection_failed", error=str(e))
            return False

    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: Optional[dict] = None,
    ) -> list[MemoryItem]:
        """Fetch memories from LangGraph Store via search."""
        try:
            payload: dict = {
                "namespace": self.namespace,
                "limit": limit,
                "offset": offset,
            }

            resp = await self.client.post("/store/search", json=payload)
            resp.raise_for_status()
            data = resp.json()

            items = data if isinstance(data, list) else data.get("items", data.get("results", []))
            return [self._to_memory_item(item) for item in items]
        except Exception as e:
            logger.error("langmem_fetch_failed", error=str(e))
            # Fallback: try listing items
            return await self._list_items(limit, offset)

    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a single memory by key."""
        try:
            resp = await self.client.post("/store/get", json={
                "namespace": self.namespace,
                "key": external_id,
            })
            resp.raise_for_status()
            data = resp.json()
            if data:
                item = data if isinstance(data, dict) and "key" in data else data.get("item", data)
                if item:
                    return self._to_memory_item(item)
            return None
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Write trust scores back by updating item values."""
        for update in updates:
            try:
                # First get current value
                resp = await self.client.post("/store/get", json={
                    "namespace": self.namespace,
                    "key": update.external_id,
                })
                resp.raise_for_status()
                current = resp.json()

                value = current.get("value", {}) if isinstance(current, dict) else {}
                if update.trust_score is not None:
                    value["memguard_trust_score"] = update.trust_score
                if update.status:
                    value["memguard_status"] = update.status
                if update.metadata_updates:
                    value.update(update.metadata_updates)

                resp = await self.client.post("/store/put", json={
                    "namespace": self.namespace,
                    "key": update.external_id,
                    "value": value,
                })
                resp.raise_for_status()
            except Exception as e:
                logger.error("langmem_writeback_failed", key=update.external_id, error=str(e))
                return False
        return True

    async def get_memory_count(self) -> int:
        """Count items in the namespace."""
        try:
            resp = await self.client.post("/store/search", json={
                "namespace": self.namespace,
                "limit": 1,
            })
            resp.raise_for_status()
            data = resp.json()

            if isinstance(data, dict) and "total" in data:
                return data["total"]
            # Fallback: fetch a larger batch and count
            resp = await self.client.post("/store/search", json={
                "namespace": self.namespace,
                "limit": 1000,
            })
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("items", [])
            return len(items)
        except Exception as e:
            logger.error("langmem_count_failed", error=str(e))
            return 0

    def supports_writeback(self) -> bool:
        return True

    def supports_source_metadata(self) -> bool:
        return False

    # --- Internal ---

    async def _list_items(self, limit: int, offset: int) -> list[MemoryItem]:
        """Fallback: list items in namespace."""
        try:
            resp = await self.client.post("/store/list", json={
                "namespace_prefix": self.namespace,
                "limit": limit,
                "offset": offset,
            })
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("items", [])
            return [self._to_memory_item(item) for item in items]
        except Exception as e:
            logger.error("langmem_list_failed", error=str(e))
            return []

    def _to_memory_item(self, item: dict) -> MemoryItem:
        """Convert a LangGraph Store item to MemoryItem."""
        key = item.get("key", "")
        value = item.get("value", {})
        namespace = item.get("namespace", self.namespace)

        # The memory content can be in various fields
        content = (
            value.get("content")
            or value.get("memory")
            or value.get("text")
            or value.get("fact")
            or str(value) if value else ""
        )

        return MemoryItem(
            external_id=key,
            content=content,
            metadata={
                "namespace": namespace,
                "store_value": value,
                "memory_type": value.get("type", "memory"),
            },
            source_type="langgraph_store",
            created_at=_parse_dt(item.get("created_at")),
            updated_at=_parse_dt(item.get("updated_at")),
        )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
