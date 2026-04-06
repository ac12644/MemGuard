from src.engine.fact_classifier import classify_fact_type, get_fact_type_volatility


class TestFactClassifier:
    def test_job_title(self):
        fact_type, confidence = classify_fact_type("John works as a Senior Engineer at Google")
        assert fact_type == "job_title"
        assert confidence > 0.3

    def test_pricing(self):
        fact_type, confidence = classify_fact_type("The subscription costs $99 per month")
        assert fact_type == "pricing"
        assert confidence > 0.3

    def test_address(self):
        fact_type, confidence = classify_fact_type("The company is headquartered at 123 Main Street")
        assert fact_type == "address"
        assert confidence > 0.3

    def test_company_info(self):
        fact_type, confidence = classify_fact_type("Acme Corp was founded in 2020 with 50 employees")
        assert fact_type == "company_info"
        assert confidence > 0.3

    def test_preference(self):
        fact_type, confidence = classify_fact_type("The user prefers dark mode and usually works late")
        assert fact_type == "preference"
        assert confidence > 0.3

    def test_technical_fact(self):
        fact_type, confidence = classify_fact_type("The API endpoint uses version 3 of the protocol")
        assert fact_type == "technical_fact"
        assert confidence > 0.3

    def test_unknown_returns_other(self):
        fact_type, confidence = classify_fact_type("The sky is blue today")
        assert fact_type == "other"
        assert confidence == 0.3

    def test_confidence_bounded(self):
        _, confidence = classify_fact_type("CEO manager director engineer developer analyst")
        assert 0.0 <= confidence <= 1.0


class TestFactTypeVolatility:
    def test_pricing_more_volatile_than_address(self):
        pricing_v = get_fact_type_volatility("pricing")
        address_v = get_fact_type_volatility("address")
        assert pricing_v > address_v

    def test_volatility_bounded(self):
        for ft in ["job_title", "pricing", "address", "preference", "other", None]:
            v = get_fact_type_volatility(ft)
            assert 0.0 <= v <= 1.0

    def test_unknown_type_uses_default(self):
        v = get_fact_type_volatility("nonexistent_type")
        assert 0.0 <= v <= 1.0
