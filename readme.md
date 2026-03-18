# Distributed Log Analytics System

> A production-style log analytics platform inspired by Splunk and ELK Stack.
> Ingests multi-service logs via local shipper agents, stores raw events in
> ScyllaDB/Cassandra and aggregates in PostgreSQL, and exposes REST APIs
> for search and stats — fully containerized and deployable to free cloud tiers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOG PRODUCERS                               │
│   generate_logs.py / generate_logs.sh                          │
│   Simulates auth-service, payment-service, api-gateway          │
│   Writes JSON Lines to ./logs/<service>.log                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ tails files (byte-offset registry)
┌──────────────────────────▼──────────────────────────────────────┐
│                     LOG SHIPPER                                  │
│   shipper.py                                                    │
│   Batches 100 events · Exponential backoff · Disk buffer        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /ingest (HTTP + API key)
┌──────────────────────────▼──────────────────────────────────────┐
│               INGESTION API  :8000  (FastAPI)                   │
│   Parses · Validates · Enriches (log_date, uuid)               │
│        ┌──────────────────┴──────────────────┐                 │
│        ▼                                     ▼                  │
│  Cassandra/ScyllaDB                    PostgreSQL               │
│  Raw logs                              Hourly aggregates        │
│  (service_name, log_date) PK           service_registry         │
└─────────────────────────────────────────────────────────────────┘
                           │ queried by
┌──────────────────────────▼──────────────────────────────────────┐
│               QUERY API  :8001  (FastAPI)                       │
│   GET /logs/search  →  Cassandra                               │
│   GET /logs/stats   →  PostgreSQL                              │
│   GET /services     →  PostgreSQL                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        CLI (logs_cli.py)         curl / OpenAPI UI
```

---

## Quick Start (Local)

### Prerequisites
- Docker Desktop (running)
- Python 3.11+
- Git Bash (Windows) or any Unix terminal

### 1. Clone and configure
```bash
git clone <your-repo-url>
cd log-analytics-system
cp .env.example .env
```

### 2. Start all services
```bash
make up
# Wait ~60s for Cassandra to be ready
# Ingestion API → http://localhost:8000/docs
# Query API     → http://localhost:8001/docs
```

### 3. Install local Python deps
```bash
pip install pyyaml==6.0.1 typer rich
```

### 4. Generate logs
```bash
make produce          # runs for 30 seconds, writes to ./logs/
```

### 5. Ship logs to the API
```bash
make ship             # tails ./logs/ and POSTs to ingestion API
```

### 6. Query results
```bash
# Via CLI
python cli/logs_cli.py search --service auth-service
python cli/logs_cli.py stats
python cli/logs_cli.py services

# Via curl
curl "http://localhost:8001/logs/search?service=auth-service&limit=5" \
     -H "X-API-Key: dev-secret-key-change-in-prod"

curl "http://localhost:8001/logs/stats?service=payment-service" \
     -H "X-API-Key: dev-secret-key-change-in-prod"

curl "http://localhost:8001/services" \
     -H "X-API-Key: dev-secret-key-change-in-prod"
```

### One-command smoke test
```bash
make smoke
```

---

## Running Tests

```bash
# Unit tests only (no Docker needed)
make test-unit

# Integration tests (docker compose must be running)
make test-integration

# All tests
make test
```

Expected output:
```
tests/unit_tests/test_shipper.py::TestFileRegistry::test_default_offset_is_zero PASSED
tests/unit_tests/test_shipper.py::TestDiskBuffer::test_write_and_drain PASSED
...
tests/integration_test.py::TestIngestion::test_ingest_single_event PASSED
tests/integration_test.py::TestQuery::test_search_returns_events PASSED
...
```

---

## API Reference

### Ingestion API (port 8000)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Ingest single event or batch (array) |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

**POST /ingest payload:**
```json
[{
  "timestamp": "2026-03-17T10:00:00Z",
  "service": "auth-service",
  "severity": "ERROR",
  "message": "Login failed for user_id=1234",
  "host": "auth-host-1",
  "metadata": {"request_id": "abc123"}
}]
```

### Query API (port 8001)

| Method | Path | Params |
|--------|------|--------|
| GET | `/logs/search` | `service`*, `severity`, `q`, `start`, `end`, `limit`, `page_token` |
| GET | `/logs/stats` | `service`, `start`, `end` |
| GET | `/services` | — |

> `*` required. Full OpenAPI docs at http://localhost:8001/docs

---

## Cloud Deployment (Hybrid Free Tier)

### 1. ScyllaDB Cloud (Cassandra)
1. Sign up at https://cloud.scylladb.com → create free cluster
2. Copy connection string, username, password, datacenter name
3. Set in your environment:
```
CASSANDRA_HOST=<your-scylladb-host>
SCYLLA_USERNAME=<username>
SCYLLA_PASSWORD=<password>
SCYLLA_DATACENTER=<datacenter>
```

### 2. PostgreSQL (Railway)
1. Go to https://railway.app → New Project → PostgreSQL
2. Copy the `DATABASE_URL` from the Connect tab
3. Set: `POSTGRES_DSN=<your-railway-postgres-url>`

### 3. Deploy APIs to Render
1. Push your repo to GitHub
2. New Web Service → connect repo → select `ingestion_api/` folder
3. Set environment variables from your `.env`
4. Repeat for `query_api/`
5. Note both service URLs

### 4. Point local shipper at cloud
```yaml
# log_shipper/config.yaml
ingestion:
  url: "https://your-ingestion-api.onrender.com"
  api_key: "your-production-key"
```
Or set: `INGESTION_URL=https://your-ingestion-api.onrender.com`

### Verify end-to-end
```bash
python log_producer/generate_logs.py --duration 10
python log_shipper/shipper.py --once
curl "https://your-query-api.onrender.com/services" \
     -H "X-API-Key: your-production-key"
```

---

## Project Description (Resume)

Engineered a production-style Distributed Log Analytics Platform inspired by Splunk and ELK Stack — ingesting multi-service logs via local shipper agents with exponential backoff and disk buffering, storing raw events in ScyllaDB/Cassandra partitioned by service and date for high-throughput writes, and persisting hourly aggregates in PostgreSQL. Exposed REST APIs via FastAPI for log search with cursor pagination, time-bucketed stats, and service discovery; built a Python CLI for developer access. Fully containerized with Docker Compose, instrumented with Prometheus metrics, and deployable to free cloud tiers (Render + ScyllaDB Cloud + Railway Postgres).

---

## Manual Checklist

- [ ] Install Docker Desktop and confirm it's running
- [ ] Run `cp .env.example .env`
- [ ] Run `make up` and wait ~60s for Cassandra to initialize
- [ ] Install local deps: `pip install pyyaml typer rich`
- [ ] (Cloud only) Create ScyllaDB Cloud free account
- [ ] (Cloud only) Create Railway Postgres instance
- [ ] (Cloud only) Deploy to Render and update `.env` with cloud URLs