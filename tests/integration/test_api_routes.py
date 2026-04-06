"""Integration tests for API routes.

Tests against the live running server at localhost:8001.
Requires: docker-compose up postgres redis && uvicorn running.
"""

import uuid

import httpx
import pytest

BASE = "http://localhost:8001"


@pytest.fixture
def client():
    return httpx.Client(base_url=BASE, timeout=10.0)


class TestHealthEndpoint:
    def test_health_returns_status(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["database"] == "healthy"
        assert data["redis"] == "healthy"


class TestConnectorRoutes:
    def test_connector_crud(self, client):
        # Create
        name = f"IntTest-{uuid.uuid4().hex[:8]}"
        resp = client.post("/api/v1/connectors", json={
            "connector_type": "generic_rest",
            "name": name,
            "config": {"base_url": "https://example.com"},
        })
        assert resp.status_code == 201
        connector_id = resp.json()["id"]

        # List
        resp = client.get("/api/v1/connectors")
        assert resp.status_code == 200
        assert any(c["id"] == connector_id for c in resp.json())

        # Get
        resp = client.get(f"/api/v1/connectors/{connector_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == name

        # Update
        resp = client.put(f"/api/v1/connectors/{connector_id}", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"

        # Delete
        resp = client.delete(f"/api/v1/connectors/{connector_id}")
        assert resp.status_code == 204

    def test_connector_not_found(self, client):
        resp = client.get(f"/api/v1/connectors/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestMemoryRoutes:
    def test_list_memories(self, client):
        resp = client.get("/api/v1/memories")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_memory_stats(self, client):
        resp = client.get("/api/v1/memories/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "avg_trust_score" in data
        assert "fact_type_distribution" in data

    def test_memory_not_found(self, client):
        resp = client.get(f"/api/v1/memories/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_filter_by_status(self, client):
        resp = client.get("/api/v1/memories?status=active&limit=5")
        assert resp.status_code == 200

    def test_sort_by_trust(self, client):
        resp = client.get("/api/v1/memories?sort_by=trust_score&sort_order=asc")
        assert resp.status_code == 200
        memories = resp.json()
        if len(memories) >= 2:
            assert memories[0]["trust_score"] <= memories[1]["trust_score"]


class TestValidationRoutes:
    def test_create_and_cancel(self, client):
        resp = client.post("/api/v1/validations", json={
            "job_type": "source_linked", "priority": 3,
        })
        assert resp.status_code == 201
        job_id = resp.json()["id"]
        assert resp.json()["status"] == "pending"

        resp = client.get("/api/v1/validations")
        assert resp.status_code == 200
        assert any(j["id"] == job_id for j in resp.json())

        resp = client.post(f"/api/v1/validations/{job_id}/cancel")
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"


class TestQuarantineRoutes:
    def test_list_quarantine(self, client):
        resp = client.get("/api/v1/quarantine")
        assert resp.status_code == 200


class TestAuditRoutes:
    def test_list_and_verify(self, client):
        resp = client.get("/api/v1/audit")
        assert resp.status_code == 200

        resp = client.get("/api/v1/audit/verify-integrity")
        assert resp.status_code == 200
        assert resp.json()["valid"] is True


class TestAnalyticsRoutes:
    def test_health_score(self, client):
        resp = client.get("/api/v1/analytics/health-score")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_score" in data
        assert "total_memories" in data

    def test_staleness_and_risk(self, client):
        resp = client.get("/api/v1/analytics/staleness-heatmap")
        assert resp.status_code == 200

        resp = client.get("/api/v1/analytics/high-risk")
        assert resp.status_code == 200


class TestSettingsRoutes:
    def test_get_settings(self, client):
        resp = client.get("/api/v1/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "settings" in data
        assert "defaults" in data
        assert "overrides" in data

    def test_update_and_reset(self, client):
        resp = client.put("/api/v1/settings", json={"trust_flag_threshold": 0.55})
        assert resp.status_code == 200
        assert resp.json()["overrides"]["trust_flag_threshold"] == 0.55

        resp = client.delete("/api/v1/settings")
        assert resp.status_code == 200
        assert resp.json()["overrides"] == {}

    def test_api_key_info(self, client):
        resp = client.get("/api/v1/settings/api-key")
        assert resp.status_code == 200
        assert "key_hash_prefix" in resp.json()

    def test_regenerate_api_key(self, client):
        resp = client.post("/api/v1/settings/api-key")
        assert resp.status_code == 200
        assert resp.json()["api_key"].startswith("mg_")


class TestWebhookRoutes:
    def test_webhook_crud(self, client):
        resp = client.post("/api/v1/webhooks", json={
            "url": "https://example.com/hook",
            "events": ["memory.flagged"],
        })
        assert resp.status_code == 201
        wid = resp.json()["id"]

        resp = client.get("/api/v1/webhooks")
        assert resp.status_code == 200
        assert any(w["id"] == wid for w in resp.json())

        resp = client.delete(f"/api/v1/webhooks/{wid}")
        assert resp.status_code == 204

    def test_invalid_events(self, client):
        resp = client.post("/api/v1/webhooks", json={
            "url": "https://example.com/hook",
            "events": ["bad.event"],
        })
        assert resp.status_code == 400
