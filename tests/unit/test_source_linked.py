import pytest

from src.engine.strategies.source_linked import validate_source_linked


@pytest.fixture
def mock_httpx(httpx_mock):
    return httpx_mock


class TestSourceLinkedValidation:
    @pytest.mark.asyncio
    async def test_verified_exact_match(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            json={"title": "Senior Engineer"},
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
            source_field="title",
        )
        assert result["outcome"] == "verified"
        assert result["confidence"] >= 0.9
        assert not result["drift_detected"]

    @pytest.mark.asyncio
    async def test_verified_case_insensitive(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            json={"title": "senior engineer"},
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
            source_field="title",
        )
        assert result["outcome"] == "verified"

    @pytest.mark.asyncio
    async def test_flagged_on_drift(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            json={"title": "VP Engineering"},
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
            source_field="title",
        )
        assert result["outcome"] == "flagged"
        assert result["drift_detected"]
        assert result["source_current_value"] == "VP Engineering"

    @pytest.mark.asyncio
    async def test_source_404(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/999",
            status_code=404,
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/999",
        )
        assert result["outcome"] == "source_unavailable"

    @pytest.mark.asyncio
    async def test_source_403(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            status_code=403,
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
        )
        assert result["outcome"] == "error"
        assert "403" in result["reasoning"]

    @pytest.mark.asyncio
    async def test_field_not_found(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            json={"name": "John"},
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
            source_field="title",
        )
        assert result["outcome"] == "flagged"

    @pytest.mark.asyncio
    async def test_nested_field_extraction(self, mock_httpx):
        mock_httpx.add_response(
            url="https://api.example.com/employees/123",
            json={"employee": {"role": {"title": "Senior Engineer"}}},
        )
        result = await validate_source_linked(
            memory_content="Senior Engineer",
            source_url="https://api.example.com/employees/123",
            source_field="employee.role.title",
        )
        assert result["outcome"] == "verified"
