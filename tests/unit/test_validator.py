import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from src.config import settings
from src.engine import validator
from src.engine.validator import _compute_new_trust, _quarantine_reason, _validate_memory
from src.models.memory_record import MemoryRecord


def make_memory(**overrides) -> MemoryRecord:
    memory = MemoryRecord(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        connector_id=uuid.uuid4(),
        external_id="mem-001",
        content="John works as Senior Engineer at Acme Corp",
        fact_type="job_title",
        source_metadata={},
        retrieval_count=10,
        trust_score=0.9,
        status="active",
        validation_count=0,
    )
    memory.created_at = datetime(2025, 1, 1, tzinfo=UTC)
    for key, value in overrides.items():
        setattr(memory, key, value)
    return memory


class TestValidateMemoryDispatch:
    @pytest.mark.asyncio
    async def test_semantic_drift_dispatches_with_recent_context(self, monkeypatch):
        memory = make_memory()
        captured = {}

        async def fake_context(mem, db, limit=10):
            return ["User mentioned John was promoted to VP"]

        async def fake_drift(memory_content, memory_created_at, recent_context):
            captured["content"] = memory_content
            captured["context"] = recent_context
            return {"outcome": "flagged", "likely_stale": True, "confidence": 0.8, "reasoning": "x"}

        monkeypatch.setattr(validator, "_fetch_recent_context", fake_context)
        monkeypatch.setattr(validator, "validate_semantic_drift", fake_drift)

        evidence = await _validate_memory(memory, "semantic_drift", AsyncMock())

        assert evidence["outcome"] == "flagged"
        assert captured["content"] == memory.content
        assert captured["context"] == ["User mentioned John was promoted to VP"]

    @pytest.mark.asyncio
    async def test_temporal_pattern_dispatches_with_learned_pattern(self, monkeypatch):
        memory = make_memory()
        captured = {}

        class FakePattern:
            avg_staleness_days = 90.0
            sample_size = 50

        async def fake_pattern(mem, db):
            return FakePattern()

        async def fake_temporal(
            memory_content,
            memory_created_at,
            fact_type,
            learned_avg_staleness_days,
            learned_sample_size,
            last_validated_at,
        ):
            captured["avg"] = learned_avg_staleness_days
            captured["samples"] = learned_sample_size
            captured["fact_type"] = fact_type
            return {"outcome": "verified", "staleness_probability": 0.2, "confidence": 0.7, "reasoning": "x"}

        monkeypatch.setattr(validator, "_fetch_staleness_pattern", fake_pattern)
        monkeypatch.setattr(validator, "validate_temporal_pattern", fake_temporal)

        evidence = await _validate_memory(memory, "temporal_pattern", AsyncMock())

        assert evidence["outcome"] == "verified"
        assert captured["avg"] == 90.0
        assert captured["samples"] == 50
        assert captured["fact_type"] == "job_title"

    @pytest.mark.asyncio
    async def test_unknown_strategy_returns_error(self):
        memory = make_memory()
        evidence = await _validate_memory(memory, "causal_chain", AsyncMock())
        assert evidence["outcome"] == "error"
        assert "not yet implemented" in evidence["reasoning"]


class TestComputeNewTrust:
    def test_quarantined_outcome_drops_below_threshold(self):
        memory = make_memory(trust_score=0.9)
        evidence = {"outcome": "quarantined", "contradicted": True, "confidence": 0.9}
        new_trust = _compute_new_trust(memory, evidence)
        assert new_trust < settings.memguard_quarantine_threshold

    def test_flagged_likely_stale_uses_drift_penalty(self):
        memory = make_memory(trust_score=0.8)
        with_stale = _compute_new_trust(
            memory, {"outcome": "flagged", "likely_stale": True, "confidence": 1.0}
        )
        without_stale = _compute_new_trust(
            memory, {"outcome": "flagged", "confidence": 1.0}
        )
        assert with_stale == pytest.approx(0.5)
        assert without_stale == pytest.approx(0.65)

    def test_flagged_high_staleness_probability_uses_drift_penalty(self):
        memory = make_memory(trust_score=0.8)
        new_trust = _compute_new_trust(
            memory, {"outcome": "flagged", "staleness_probability": 0.85, "confidence": 1.0}
        )
        assert new_trust == pytest.approx(0.5)


class TestQuarantineReason:
    def test_contradicted_wins(self):
        assert _quarantine_reason({"contradicted": True, "likely_stale": True}) == "contradicted"

    def test_likely_stale_maps_to_stale(self):
        assert _quarantine_reason({"likely_stale": True}) == "stale"

    def test_drift_detected_maps_to_stale(self):
        assert _quarantine_reason({"drift_detected": True}) == "stale"

    def test_high_staleness_probability_maps_to_stale(self):
        assert _quarantine_reason({"staleness_probability": 0.9}) == "stale"

    def test_default_is_contradicted(self):
        assert _quarantine_reason({}) == "contradicted"
