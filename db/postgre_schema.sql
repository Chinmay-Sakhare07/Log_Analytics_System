
-- ============================================================
-- PostgreSQL Schema — Distributed Log Analytics
-- ============================================================
-- Rationale: Postgres handles relational/aggregate workloads that
-- Astra is poorly suited for (GROUP BY, SUM, joins, metadata).
-- This schema is auto-run by Docker on first container start via
-- /docker-entrypoint-initdb.d/.

-- ============================================================
-- 1. log_aggregates
-- ============================================================
-- Stores pre-aggregated hourly severity counts per service.
-- Rationale: Pre-aggregation during ingestion means the stats
-- endpoint is a cheap SELECT, not a live Astra scan + COUNT.
-- Upserted by ingestion API using ON CONFLICT DO UPDATE.

CREATE TABLE IF NOT EXISTS log_aggregates (
    service_name  TEXT        NOT NULL,
    hour_bucket   TIMESTAMP   NOT NULL,  -- Truncated to hour: date_trunc('hour', timestamp)
    error_count   INT         NOT NULL DEFAULT 0,
    warn_count    INT         NOT NULL DEFAULT 0,
    info_count    INT         NOT NULL DEFAULT 0,
    debug_count   INT         NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (service_name, hour_bucket)
);

-- Index for time-range scans across all services (dashboard use case)
CREATE INDEX IF NOT EXISTS idx_agg_hour_bucket ON log_aggregates (hour_bucket);

-- ============================================================
-- 2. service_registry
-- ============================================================
-- Tracks known services and their last activity.
-- Rationale: Powers GET /services without a Astra DISTINCT
-- scan (which is expensive across all partitions).

CREATE TABLE IF NOT EXISTS service_registry (
    service_name  TEXT        PRIMARY KEY,
    first_seen    TIMESTAMP   NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMP   NOT NULL DEFAULT NOW(),
    host          TEXT,                 -- Last known host for this service
    total_events  BIGINT      NOT NULL DEFAULT 0
);

-- ============================================================
-- 3. saved_queries
-- ============================================================
-- Optional: lets CLI/dashboard users save and replay queries.
-- Rationale: Pure metadata — small table, relational, easy to
-- extend (add tags, schedules, etc.) without touching Astra.

CREATE TABLE IF NOT EXISTS saved_queries (
    id            SERIAL      PRIMARY KEY,
    query_name    TEXT        NOT NULL,
    query_text    TEXT        NOT NULL,   -- JSON-serialized query params
    created_by    TEXT        NOT NULL DEFAULT 'cli',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Helper function: upsert service registry
-- ============================================================
-- Called by ingestion API on every ingest batch.
-- Uses INSERT ... ON CONFLICT for atomicity (no race condition).

CREATE OR REPLACE FUNCTION upsert_service_registry(
    p_service_name TEXT,
    p_host         TEXT,
    p_event_count  INT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO service_registry (service_name, host, last_seen, total_events)
    VALUES (p_service_name, p_host, NOW(), p_event_count)
    ON CONFLICT (service_name) DO UPDATE
        SET last_seen   = NOW(),
            host        = EXCLUDED.host,
            total_events = service_registry.total_events + EXCLUDED.total_events;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Seed data (optional — useful for local dev smoke tests)
-- ============================================================
INSERT INTO service_registry (service_name, host, total_events)
VALUES
    ('auth-service',     'host-local', 0),
    ('payment-service',  'host-local', 0),
    ('api-gateway',      'host-local', 0)
ON CONFLICT DO NOTHING;