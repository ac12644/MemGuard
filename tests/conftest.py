import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from src.connectors.base import BaseConnector, MemoryItem


@pytest.fixture
def sample_memory_item():
    return MemoryItem(
        external_id="mem-001",
        content="John works as Senior Engineer at Acme Corp",
        metadata={"source": "conversation"},
        source_type="api",
        source_url="https://api.example.com/employees/123",
        source_field="title",
        created_at=datetime(2025, 1, 1, tzinfo=UTC),
        updated_at=datetime(2025, 6, 1, tzinfo=UTC),
        retrieval_count=42,
        tags=["employee", "role"],
        user_id="user-001",
    )


@pytest.fixture
def mock_connector():
    connector = AsyncMock(spec=BaseConnector)
    connector.connect.return_value = True
    connector.get_memory_count.return_value = 10
    connector.supports_writeback.return_value = True
    connector.supports_source_metadata.return_value = False
    return connector


@pytest.fixture
def tenant_id():
    return uuid.UUID("00000000-0000-0000-0000-000000000001")
