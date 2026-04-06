
from src.engine.trust_calculator import calculate_trust_score


class TestTrustCalculator:
    def test_perfect_score(self):
        score = calculate_trust_score(
            source_reliability=1.0,
            time_since_verified=0.0,
            fact_type_volatility=0.0,
            cross_ref_agreement=1.0,
            dependency_health=1.0,
            historical_accuracy=1.0,
            retrieval_frequency=1.0,
        )
        assert score == 1.0

    def test_zero_inputs(self):
        score = calculate_trust_score(
            source_reliability=0.0,
            time_since_verified=10000,
            fact_type_volatility=1.0,
            cross_ref_agreement=0.0,
            dependency_health=0.0,
            historical_accuracy=0.0,
            retrieval_frequency=0.0,
        )
        assert 0.0 <= score <= 0.05

    def test_freshness_decays_over_time(self):
        recent = calculate_trust_score(time_since_verified=1.0)
        old = calculate_trust_score(time_since_verified=500.0)
        assert recent > old

    def test_high_volatility_decays_faster(self):
        stable = calculate_trust_score(
            time_since_verified=200, fact_type_volatility=0.1
        )
        volatile = calculate_trust_score(
            time_since_verified=200, fact_type_volatility=0.9
        )
        assert stable > volatile

    def test_score_bounded(self):
        for src in [0.0, 0.5, 1.0]:
            for t in [0, 100, 1000]:
                score = calculate_trust_score(
                    source_reliability=src, time_since_verified=t
                )
                assert 0.0 <= score <= 1.0

    def test_custom_weights(self):
        custom = {
            "source_reliability": 1.0,
            "freshness": 0.0,
            "cross_ref": 0.0,
            "dependency": 0.0,
            "historical": 0.0,
            "retrieval_importance": 0.0,
        }
        score = calculate_trust_score(
            source_reliability=0.5,
            weights=custom,
        )
        assert score == 0.5

    def test_retrieval_frequency_capped_at_1(self):
        normal = calculate_trust_score(retrieval_frequency=1.0)
        over = calculate_trust_score(retrieval_frequency=5.0)
        assert normal == over
