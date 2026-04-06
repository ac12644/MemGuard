from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class MemoryItem:
    """Normalized memory representation from any source system."""

    external_id: str
    content: str
    metadata: dict
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    source_field: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    retrieval_count: Optional[int] = None
    tags: list[str] = field(default_factory=list)
    user_id: Optional[str] = None
    agent_id: Optional[str] = None


@dataclass
class MemoryUpdate:
    """Update to write back to the source memory system."""

    external_id: str
    trust_score: Optional[float] = None
    status: Optional[str] = None
    metadata_updates: Optional[dict] = None


class BaseConnector(ABC):
    """Abstract interface for memory system connectors."""

    @abstractmethod
    async def connect(self, config: dict) -> bool:
        """Test connection to the memory system. Return True if successful."""
        ...

    @abstractmethod
    async def fetch_memories(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "retrieval_count",
        sort_order: str = "desc",
        filters: Optional[dict] = None,
    ) -> list[MemoryItem]:
        """Fetch memories from the source system."""
        ...

    @abstractmethod
    async def fetch_memory_by_id(self, external_id: str) -> Optional[MemoryItem]:
        """Fetch a single memory by its ID in the source system."""
        ...

    @abstractmethod
    async def write_back(self, updates: list[MemoryUpdate]) -> bool:
        """Write validation results back to the source system."""
        ...

    @abstractmethod
    async def get_memory_count(self) -> int:
        """Return total number of memories in the connected system."""
        ...

    def supports_writeback(self) -> bool:
        """Whether this connector supports writing trust scores back."""
        return True

    def supports_source_metadata(self) -> bool:
        """Whether memories from this source include fetchable source URLs."""
        return False
