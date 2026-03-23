"""
integration_test.py — End-to-end test.
Requires: docker compose up -d (services must be running)
Run:      pytest tests/integration_test.py -v -s

Flow: produce logs → ship → search → assert events stored → check aggregates
"""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

INGESTION_URL = "http://localhost:8000"
QUERY_URL     = "http://localhost:8001"
API_KEY       = "dev-secret-key-change-in-prod"
HEADERS       = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def post(path: str, body: dict | list) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{INGESTION_URL}{path}", data=data, headers=HEADERS, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def get(base: str, path: str, params: dict = {}) -> dict | list:
    qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    url = f"{base}{path}?{qs}" if qs else f"{base}{path}"
    req = urllib.request.Request(url, headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def wait_for_service(url: str, retries: int = 20, delay: float = 3.0) -> None:
    """Poll /health until the service responds or retries are exhausted."""
    for i in range(retries):
        try:
            req = urllib.request.Request(f"{url}/health")
            with urllib.request.urlopen(req, timeout=5):
                print(f"  ✓ {url} is ready")
                return
        except Exception:
            print(f"  Waiting for {url} ({i+1}/{retries})...")
            time.sleep(delay)
    pytest.fail(f"Service at {url} did not become ready after {retries} attempts")


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def wait_for_services():
    """Wait for both APIs to be healthy before running any test."""
    print("\nWaiting for services to be ready...")
    wait_for_service(INGESTION_URL)
    wait_for_service(QUERY_URL)


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestIngestion:
    def test_health_ingestion(self):
        result = get(INGESTION_URL, "/health")
        assert result["status"] == "ok"

    def test_ingest_single_event(self):
        event = {
            "timestamp": "2026-03-17T10:00:00Z",
            "service": "integration-test-svc",
            "severity": "INFO",
            "message": "Integration test single event",
            "host": "test-host",
        }
        result = post("/ingest", event)
        assert result["status"] == "ok"
        assert result["accepted"] == 1

    def test_ingest_batch(self):
        events = [
            {
                "timestamp": f"2026-03-17T10:0{i}:00Z",
                "service": "integration-test-svc",
                "severity": sev,
                "message": f"Batch event {i}",
                "host": "test-host",
            }
            for i, sev in enumerate(["INFO", "WARN", "ERROR", "DEBUG", "INFO"])
        ]
        result = post("/ingest", events)
        assert result["status"] == "ok"
        assert result["accepted"] == 5

    def test_ingest_rejects_missing_required_field(self):
        import urllib.error
        bad_event = {"severity": "INFO", "message": "no service field"}
        with pytest.raises(urllib.error.HTTPError) as exc:
            post("/ingest", bad_event)
        assert exc.value.code == 422

    def test_ingest_rejects_bad_api_key(self):
        import urllib.error
        data = json.dumps({"service": "x", "severity": "INFO",
                           "message": "x", "host": "x"}).encode()
        req = urllib.request.Request(
            f"{INGESTION_URL}/ingest", data=data,
            headers={"X-API-Key": "wrong-key", "Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req, timeout=5)
        assert exc.value.code == 401


class TestQuery:
    # Rationale: sleep gives Astra time to make the write visible.
    # In production, reads after writes are eventually consistent in Astra.
    @pytest.fixture(autouse=True)
    def ingest_test_data(self, wait_for_services):
        """Ingest known events before each query test."""
        events = [
            {
                "timestamp": "2026-03-17T10:00:00Z",
                "service": "query-test-svc",
                "severity": "ERROR",
                "message": "Query test ERROR event",
                "host": "qtest-host",
            },
            {
                "timestamp": "2026-03-17T10:01:00Z",
                "service": "query-test-svc",
                "severity": "INFO",
                "message": "Query test INFO event",
                "host": "qtest-host",
            },
        ]
        post("/ingest", events)
        time.sleep(2)  # Wait for Astra write to be readable

    def test_health_query(self):
        result = get(QUERY_URL, "/health")
        assert result["status"] == "ok"

    def test_search_returns_events(self):
        result = get(QUERY_URL, "/logs/search", {
            "service": "query-test-svc",
            "start": "2026-03-17T00:00:00Z",
            "end": "2026-03-17T23:59:59Z",
        })
        assert result["count"] >= 2
        services = {e["service"] for e in result["events"]}
        assert "query-test-svc" in services

    def test_search_filters_by_severity(self):
        result = get(QUERY_URL, "/logs/search", {
            "service": "query-test-svc",
            "severity": "ERROR",
            "start": "2026-03-17T00:00:00Z",
        })
        for evt in result["events"]:
            assert evt["severity"] == "ERROR"

    def test_search_keyword_filter(self):
        result = get(QUERY_URL, "/logs/search", {
            "service": "query-test-svc",
            "q": "ERROR event",
            "start": "2026-03-17T00:00:00Z",
        })
        for evt in result["events"]:
            assert "ERROR event" in evt["message"]

    def test_stats_returns_aggregates(self):
        result = get(QUERY_URL, "/logs/stats", {"service": "query-test-svc"})
        assert isinstance(result, list)
        # At least one hourly bucket should exist
        assert len(result) >= 1
        bucket = result[0]
        assert "hour_bucket" in bucket
        assert "error_count" in bucket

    def test_services_lists_known_services(self):
        result = get(QUERY_URL, "/services")
        assert isinstance(result, list)
        service_names = [s["service"] for s in result]
        assert "query-test-svc" in service_names

    def test_pagination_token_works(self):
        # Ingest 10 events to ensure pagination triggers
        events = [
            {
                "timestamp": f"2026-03-17T11:0{i}:00Z",
                "service": "page-test-svc",
                "severity": "INFO",
                "message": f"Pagination event {i}",
                "host": "ptest-host",
            }
            for i in range(10)
        ]
        post("/ingest", events)
        time.sleep(2)

        page1 = get(QUERY_URL, "/logs/search", {
            "service": "page-test-svc",
            "start": "2026-03-17T00:00:00Z",
            "limit": 5,
        })
        assert page1["count"] == 5

        if page1.get("next_page_token"):
            page2 = get(QUERY_URL, "/logs/search", {
                "service": "page-test-svc",
                "start": "2026-03-17T00:00:00Z",
                "limit": 5,
                "page_token": page1["next_page_token"],
            })
            # Page 2 events should be different from page 1
            p1_uuids = {e["uuid"] for e in page1["events"]}
            p2_uuids = {e["uuid"] for e in page2["events"]}
            assert p1_uuids.isdisjoint(p2_uuids)