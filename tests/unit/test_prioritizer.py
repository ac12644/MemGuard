from datetime import UTC, datetime
from unittest.mock import MagicMock

from src.scheduler.prioritizer import calculate_validation_priority


def _make_memory(**kwargs):
    memory = MagicMock()
    memory.retrieval_count = kwargs.get("retrieval_count", 0)
    memory.last_validated_at = kwargs.get("last_validated_at", None)
    memory.fact_type = kwargs.get("fact_type", "other")
    memory.trust_score = kwargs.get("trust_score", 1.0)
    memory.source_metadata = kwargs.get("source_metadata", {})
    return memory


class TestValidationPrioritizer:
    def test_high_retrieval_higher_priority(self):
        low = _make_memory(retrieval_count=1)
        high = _make_memory(retrieval_count=100)
        assert calculate_validation_priority(high) > calculate_validation_priority(low)

    def test_never_validated_higher_priority(self):
        validated = _make_memory(last_validated_at=datetime.now(UTC))
        never = _make_memory(last_validated_at=None)
        assert calculate_validation_priority(never) > calculate_validation_priority(validated)

    def test_low_trust_higher_priority(self):
        trusted = _make_memory(trust_score=0.9)
        untrusted = _make_memory(trust_score=0.2)
        assert calculate_validation_priority(untrusted) > calculate_validation_priority(trusted)

    def test_source_url_bonus(self):
        no_source = _make_memory(source_metadata={})
        with_source = _make_memory(source_metadata={"source_url": "https://example.com"})
        assert calculate_validation_priority(with_source) > calculate_validation_priority(no_source)

    def test_volatile_fact_type_higher_priority(self):
        stable = _make_memory(fact_type="address")
        volatile = _make_memory(fact_type="pricing")
        assert calculate_validation_priority(volatile) > calculate_validation_priority(stable)

    def test_priority_bounded(self):
        for rc in [0, 50, 200]:
            for ts in [0.0, 0.5, 1.0]:
                p = calculate_validation_priority(
                    _make_memory(retrieval_count=rc, trust_score=ts)
                )
                assert 0.0 <= p <= 1.0
