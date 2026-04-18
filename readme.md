# LogBase

### A Log Analytics System

**Live Demo → [loganalyticssystem.vercel.app](https://loganalyticssystem.vercel.app)**

---

## The Story

Splunk, Datadog, ELK Stack. These tools show up everywhere — in system design interviews, in engineering blogs, in every backend job description worth reading. For a long time I understood what they did at a surface level but had no real sense of how they actually worked. How do you store millions of log events without queries grinding to a halt? What does the ingestion pipeline look like? How do you keep search fast when data is spread across days and services?

The only way I could think to answer those questions properly was to build one.

LogBase started as that experiment. It became a full pipeline — a file tailer that ships logs with exponential backoff and disk buffering, a dual-database storage layer that separates raw events from aggregates, two FastAPI services that handle ingestion and querying, and a React dashboard that ties it all together. Every architectural decision in here was made after hitting a real problem, not before.

The deployment alone produced nine distinct failures. Port restrictions on hosting platforms, SSL bundle management, partial find-and-replace bugs that survived code review, DNS strings with accidental suffixes, cloud machines that go to sleep mid-demo. 

---

## What It Does

LogBase collects structured log events from multiple services, ships them through an ingestion pipeline, stores them in a cloud database, and gives you a dashboard to search and visualise what your systems are doing in real time.

You can filter by service, severity, time range, and keyword. You can see hourly volume charts, error trends, severity distributions, and service health at a glance. If you want to see logs right now without setting anything up, hit the Generate button in the header and it writes 20 realistic log events directly to the database.

---

## Where This Is Going

LogBase is built to grow in two directions.

The first is adapters. Right now logs come from a local file shipper. The next step is pulling logs directly from AWS CloudWatch, Azure Monitor, and GCP Logging without any manual setup. Connect your cloud account, point it at a log group, and it flows into the same pipeline.

The second is multi-tenancy. Today it is a single-user system. The plan is a full RBAC layer where each organisation gets an isolated view of their own logs. Team members get scoped access. Admins see everything. Think of it as a self-hostable alternative to Datadog that any team can run on free cloud tiers without an enterprise contract.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOG PRODUCERS                            │
│              generate_logs.py / generate_logs.sh                │
│        Simulates auth, payment, api-gateway, user,              │
│              notification, report services                      │
│            Writes JSON Lines to ./logs/<service>.log            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ tails files (byte-offset registry)
┌──────────────────────────▼──────────────────────────────────────┐
│                        LOG SHIPPER                              │
│                        shipper.py                               │
│       Batches 100 events · Exponential backoff · Disk buffer    │
│            At-least-once delivery guarantee                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /ingest  (HTTP + API key)
┌──────────────────────────▼──────────────────────────────────────┐
│                INGESTION API  (FastAPI · port 8000)             │
│          Parses · Validates · Enriches (log_date, uuid)         │
│                Rate limited · Prometheus metrics                │
│        ┌──────────────────┴──────────────────┐                 │
│        ▼                                     ▼                  │
│   Astra DB (Cassandra)               PostgreSQL                 │
│   Raw log events                     Hourly aggregates          │
│   Partitioned by                     Service registry           │
│   (service, date)                    Saved queries              │
└─────────────────────────────────────────────────────────────────┘
                           │ queried by
┌──────────────────────────▼──────────────────────────────────────┐
│                 QUERY API  (FastAPI · port 8001)                │
│         GET /logs/search  →  Astra DB (cursor pagination)      │
│         GET /logs/stats   →  PostgreSQL (hourly aggregates)     │
│         GET /services     →  PostgreSQL (service registry)      │
│                Rate limited · Input validated                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     React UI (Vercel)           CLI (logs_cli.py)
     Explorer · Analytics        search · stats
     System · Dark mode          services
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Raw log storage | Astra DB (Cassandra, eu-west-1) |
| Aggregates + registry | Neon PostgreSQL |
| Ingestion API | FastAPI · Python 3.11 · asyncpg |
| Query API | FastAPI · Python 3.11 · astrapy |
| API hosting | Fly.io (London, LHR) |
| UI | React 18 · Vite · Recharts |
| UI hosting | Vercel |
| Log shipper | Python stdlib only (zero dependencies) |
| Metrics | Prometheus (`/metrics` endpoint) |
| CI/CD | GitHub Actions (daily log generation cron) |

---

## Database Design

### Why two databases

Cassandra is good at one thing: writing and reading large volumes of time-series data fast, as long as you know your access pattern upfront. PostgreSQL is good at everything Cassandra is bad at — aggregations, GROUP BY, joins, and flexible queries.

Raw log events go to Cassandra. Hourly severity counts, service metadata, and saved queries go to PostgreSQL. This split means the stats endpoint is a cheap SELECT against a pre-aggregated table, not a live scan across millions of Cassandra rows.

### Cassandra schema

Logs are partitioned by `(service_name, log_date)` with `timestamp DESC` clustering. Every query is scoped to a single partition. No full table scans.

```sql
CREATE TABLE logs_by_service_date (
    service_name  TEXT,
    log_date      DATE,
    timestamp     TIMESTAMP,
    log_uuid      UUID,
    severity      TEXT,
    message       TEXT,
    host          TEXT,
    metadata      MAP<TEXT, TEXT>
) WITH CLUSTERING ORDER BY (timestamp DESC, log_uuid ASC);
```

`TimeWindowCompactionStrategy` groups SSTables by day so old data compacts without touching recent writes.

### PostgreSQL schema

Aggregates are upserted during ingestion using `ON CONFLICT DO UPDATE` so the stats endpoint never touches Cassandra.

```sql
CREATE TABLE log_aggregates (
    service_name  TEXT,
    hour_bucket   TIMESTAMP,
    error_count   INT,
    warn_count    INT,
    info_count    INT,
    debug_count   INT,
    PRIMARY KEY (service_name, hour_bucket)
);
```

---

## Local Setup

### Prerequisites

- Docker Desktop (running)
- Python 3.11+
- Node.js 18+

### 1. Clone and configure

```bash
git clone https://github.com/Chinmay-Sakhare07/Log_Analytics_System.git
cd log-analytics-system
cp .env.example .env
```

### 2. Start all services

```bash
make up
# Wait ~60s for Cassandra to initialise
# Ingestion API → http://localhost:8000/docs
# Query API     → http://localhost:8001/docs
```

### 3. Install Python dependencies

```bash
pip install pyyaml typer rich
```

### 4. Generate logs

```bash
make produce        # runs for 30s, writes to ./logs/
```

### 5. Ship logs to the API

```bash
make ship           # tails ./logs/ and POSTs to ingestion API
```

### 6. Start the UI

```bash
cd ui
npm install
npm run dev         # http://localhost:5173
```

### 7. Query via CLI

```bash
python cli/logs_cli.py search --service auth-service
python cli/logs_cli.py stats
python cli/logs_cli.py services
```

### One-command smoke test

```bash
make smoke
```

---

## Running Tests

```bash
# Unit tests only — no Docker needed
make test-unit

# Integration tests — docker compose must be running
make test-integration

# Everything
make test
```

---

## Cloud Deployment

### Services used

| Service | Purpose | Tier |
|---------|---------|------|
| [Fly.io](https://fly.io) | Hosts both FastAPI APIs | Free |
| [Astra DB](https://astra.datastax.com) | Managed Cassandra for raw logs | Free |
| [Neon](https://neon.tech) | Managed PostgreSQL for aggregates | Free |
| [Vercel](https://vercel.com) | Hosts the React UI | Free |

Total monthly cost: $0.

### Deploy APIs to Fly.io

```bash
cd ingestion_api
flyctl deploy --app log-analytics-ingestion

cd ../query_api
flyctl deploy --app log-analytics-query
```

### Required Fly.io secrets

```bash
flyctl secrets set ASTRA_TOKEN=<token> --app log-analytics-ingestion
flyctl secrets set ASTRA_DB_ID=<db-id> --app log-analytics-ingestion
flyctl secrets set ASTRA_DB_REGION=eu-west-1 --app log-analytics-ingestion
flyctl secrets set POSTGRES_DSN=<dsn> --app log-analytics-ingestion
flyctl secrets set CORS_ORIGINS=https://loganalyticssystem.vercel.app --app log-analytics-ingestion

flyctl secrets set ASTRA_TOKEN=<token> --app log-analytics-query
flyctl secrets set ASTRA_DB_ID=<db-id> --app log-analytics-query
flyctl secrets set ASTRA_DB_REGION=eu-west-1 --app log-analytics-query
flyctl secrets set POSTGRES_DSN=<dsn> --app log-analytics-query
flyctl secrets set CORS_ORIGINS=https://loganalyticssystem.vercel.app --app log-analytics-query
```

### Deploy UI to Vercel

Connect the GitHub repo to Vercel, set root directory to `ui/`, and every push to `main` deploys automatically.

### Vercel environment variables

| Variable | Value |
|----------|-------|
| `VITE_API_KEY` | Your API key |

---

## API Reference

### Ingestion API (port 8000)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Ingest single event or batch |
| POST | `/demo/generate` | Generate fake log events for testing |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

**POST /ingest payload**

```json
[{
  "timestamp": "2026-04-17T10:00:00Z",
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
| GET | `/health` | — |

---

## Project Structure

```
log-analytics-system/
├── ingestion_api/          # FastAPI ingestion service
│   ├── app.py              # Routes, auth, CORS, rate limiting
│   ├── astra_client.py     # Astra DB writes
│   ├── postgres_client.py  # PostgreSQL writes
│   ├── Dockerfile
│   └── requirements.txt
├── query_api/              # FastAPI query service
│   ├── app.py              # Routes, auth, CORS, rate limiting
│   ├── query_engine.py     # Astra + PostgreSQL reads
│   ├── Dockerfile
│   └── requirements.txt
├── log_producer/           # Simulated log generator
│   ├── generate_logs.py
│   └── generate_logs.sh
├── log_shipper/            # File tailer + HTTP sender
│   ├── shipper.py
│   └── config.yaml
├── cli/                    # Developer CLI
│   └── logs_cli.py
├── db/                     # Database schemas
│   ├── cassandra_schema.cql
│   └── postgre_schema.sql
├── ui/                     # React frontend
│   └── src/
│       ├── components/
│       │   ├── Dashboard.jsx
│       │   ├── LogGeneratorPanel.jsx
│       │   ├── ThemePopup.jsx
│       │   └── tabs/
│       │       ├── Explorer.jsx
│       │       ├── Analytics.jsx
│       │       └── SystemTab.jsx
│       ├── hooks/
│       │   └── useLogQuery.js
│       └── lib/
│           ├── api.js
│           ├── constants.js
│           └── demo.js
├── tests/
│   ├── unit_tests/
│   └── intergation_test.py
├── .github/
│   └── workflows/
│       └── keep-warm.yml
├── docker-compose.yml
├── Makerfile
└── .env.example
```

---

## Deployment Challenges

Getting this running on free cloud tiers was not straightforward. Nine separate problems came up between local development and a working production deployment — port restrictions blocking Cassandra connections, SSL bundle management in containerised environments, a find-and-replace that missed one occurrence, Fly.io machines sleeping mid-demo, and a UUID with an accidental suffix copied from a dashboard.

---

## Resume Description

Built a distributed log analytics platform from scratch, inspired by Splunk and ELK Stack. Designed an ingestion pipeline with a Python file tailer agent (exponential backoff, disk buffer, at-least-once delivery), a FastAPI ingestion service writing to Astra DB partitioned by service and date, and pre-aggregated hourly counts in PostgreSQL to keep stats queries cheap. Built a separate query API with cursor-based pagination and a React dashboard featuring live tail, dark mode, analytics charts, and a real-time log generator. Deployed entirely on free cloud tiers (Fly.io, Astra DB, Neon, Vercel) with rate limiting, CORS controls, and a GitHub Actions cron for daily data generation.
