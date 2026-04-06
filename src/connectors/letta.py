from datetime import datetime
from typing import Optional

import httpx
import structlog

from src.connectors.base import BaseConnector, MemoryItem, MemoryUpdate

logger = structlog.get_logger()

LETTA_API_BASE = "https://api.letta.com/v1"


class LettaConnector(BaseConnector):
    """Adapter for Letta (formerly MemGPT) REST API.

    Letta organizes memory per-agent:
    - Core memory: structured blocks (persona, human, custom)
    - Archival memory: long-term passages (searchable vector store)
    - Recall memory: conversation history

    This connector fetches core memory blocks and archival memory passages
    as MemoryItems for validation.

    Config:
        api_key: Letta API key (required)
        agent_id: Agent ID to fetch memory from (optional — if omitted, fetches from all agents)
        base_url: Override API base URL (optional, for self-hosted Letta)
    """

    def __init__(self, config: dict) -> None:
        self.api_key: str = config["api_key"]
        self.base_url: str = config.get("base_url", LETTA_API_BASE)
        self.agent_id: Optional[str] = config.get("agent_id")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def connect(self, config: dict) -> bool:
        """Test connection by listing agents."""
        try:
            resp = await self.client.get("/agents", params={"limit": 1})
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error("letta_connection_failed", error=str(e))
            return False

    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: Optional[dict] = None,
    ) -> list[MemoryItem]:
        """Fetch memories from Letta agents.

        Combines core memory blocks and archival memory passages.
        """
        agent_ids = await self._get_agent_ids()
        all_memories: list[MemoryItem] = []

        for agent_id in agent_ids:
            # Fetch core memory blocks
            blocks = await self._fetch_core_memory(agent_id)
            all_memories.extend(blocks)

            # Fetch archival memory passages
            passages = await self._fetch_archival_memory(agent_id, limit=limit)
            all_memories.extend(passages)

        return all_memories[offset:offset + limit]

    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a memory by its external ID.

        IDs are formatted as:
        - Core blocks: "core:{agent_id}:{block_label}"
        - Archival: "arch:{agent_id}:{passage_id}"
        """
        parts = external_id.split(":", 2)
        if len(parts) < 3:
            return None

        mem_type, agent_id, item_id = parts

        if mem_type == "core":
            try:
                resp = await self.client.get(f"/agents/{agent_id}/core-memory/blocks/{item_id}")
                resp.raise_for_status()
                block = resp.json()
                return self._block_to_memory_item(agent_id, block)
            except Exception:
                return None
        elif mem_type == "arch":
            # Search archival for this passage
            try:
                resp = await self.client.get(f"/agents/{agent_id}/archival-memory")
                resp.raise_for_status()
                for p in resp.json():
                    if p.get("id") == item_id:
                        return self._passage_to_memory_item(agent_id, p)
            except Exception:
                return None

        return None

    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Write back trust scores via core memory block updates.

        Only core memory blocks can be updated. Archival memory is append-only.
        """
        for update in updates:
            parts = update.external_id.split(":", 2)
            if len(parts) < 3 or parts[0] != "core":
                continue

            _, agent_id, block_label = parts
            try:
                payload: dict = {}
                if update.metadata_updates:
                    # Letta blocks have a 'value' field (text content)
                    if "value" in update.metadata_updates:
                        payload["value"] = update.metadata_updates["value"]
                if not payload:
                    continue

                resp = await self.client.patch(
                    f"/agents/{agent_id}/core-memory/blocks/{block_label}",
                    json=payload,
                )
                resp.raise_for_status()
            except Exception as e:
                logger.error("letta_writeback_failed", external_id=update.external_id, error=str(e))
                return False
        return True

    async def get_memory_count(self) -> int:
        """Estimate total memory items across agents."""
        agent_ids = await self._get_agent_ids()
        total = 0

        for agent_id in agent_ids:
            # Count core memory blocks
            try:
                resp = await self.client.get(f"/agents/{agent_id}/core-memory/blocks")
                resp.raise_for_status()
                total += len(resp.json())
            except Exception:
                pass

            # Count archival passages (fetch first page)
            try:
                resp = await self.client.get(f"/agents/{agent_id}/archival-memory", params={"limit": 1})
                resp.raise_for_status()
                data = resp.json()
                # Response is a list; total may not be available
                total += len(data)
            except Exception:
                pass

        return total

    def supports_writeback(self) -> bool:
        return True

    def supports_source_metadata(self) -> bool:
        return False

    # --- Internal methods ---

    async def _get_agent_ids(self) -> list[str]:
        """Get agent IDs to fetch from."""
        if self.agent_id:
            return [self.agent_id]

        try:
            resp = await self.client.get("/agents", params={"limit": 50})
            resp.raise_for_status()
            agents = resp.json()
            return [a["id"] for a in agents if "id" in a]
        except Exception as e:
            logger.error("letta_list_agents_failed", error=str(e))
            return []

    async def _fetch_core_memory(self, agent_id: str) -> list[MemoryItem]:
        """Fetch core memory blocks for an agent."""
        try:
            resp = await self.client.get(f"/agents/{agent_id}/core-memory/blocks")
            resp.raise_for_status()
            blocks = resp.json()
            return [self._block_to_memory_item(agent_id, b) for b in blocks if b.get("value")]
        except Exception as e:
            logger.error("letta_core_memory_failed", agent_id=agent_id, error=str(e))
            return []

    async def _fetch_archival_memory(self, agent_id: str, limit: int = 100) -> list[MemoryItem]:
        """Fetch archival memory passages for an agent."""
        try:
            resp = await self.client.get(
                f"/agents/{agent_id}/archival-memory",
                params={"limit": limit},
            )
            resp.raise_for_status()
            passages = resp.json()
            return [self._passage_to_memory_item(agent_id, p) for p in passages if p.get("text")]
        except Exception as e:
            logger.error("letta_archival_memory_failed", agent_id=agent_id, error=str(e))
            return []

    def _block_to_memory_item(self, agent_id: str, block: dict) -> MemoryItem:
        """Convert a Letta core memory block to MemoryItem."""
        label = block.get("label", "unknown")
        return MemoryItem(
            external_id=f"core:{agent_id}:{label}",
            content=block.get("value", ""),
            metadata={
                "memory_type": "core_memory",
                "block_label": label,
                "block_id": block.get("id"),
                "agent_id": agent_id,
                "limit": block.get("limit"),
            },
            source_type="core_memory",
            created_at=_parse_dt(block.get("created_at")),
            updated_at=_parse_dt(block.get("updated_at")),
        )

    def _passage_to_memory_item(self, agent_id: str, passage: dict) -> MemoryItem:
        """Convert a Letta archival memory passage to MemoryItem."""
        passage_id = passage.get("id", "")
        return MemoryItem(
            external_id=f"arch:{agent_id}:{passage_id}",
            content=passage.get("text", ""),
            metadata={
                "memory_type": "archival_memory",
                "passage_id": passage_id,
                "agent_id": agent_id,
                "source_id": passage.get("source_id"),
            },
            source_type="archival_memory",
            created_at=_parse_dt(passage.get("created_at")),
        )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
