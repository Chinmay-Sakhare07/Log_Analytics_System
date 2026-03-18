-- ============================================================
-- Cassandra / ScyllaDB Schema — Distributed Log Analytics
-- ============================================================
-- Rationale: Keyspace uses SimpleStrategy for local dev (single node).
-- For production/ScyllaDB Cloud, switch to NetworkTopologyStrategy
-- with replication_factor = 3.

CREATE KEYSPACE IF NOT EXISTS log_analytics
    WITH replication = {
        'class': 'SimpleStrategy',
        'replication_factor': 1
    }
    AND durable_writes = true;

USE log_analytics;

-- ============================================================
-- Primary log table
-- ============================================================
-- Partition key: (service_name, log_date)
--   Rationale: All logs for a service on a given day land in one
--   partition → fast range scans without touching other partitions.
--   log_date prevents unbounded partition growth (capped at 1 day).
--
-- Clustering key: (timestamp DESC, log_uuid ASC)
--   Rationale: DESC ordering returns newest logs first (most common
--   query pattern). log_uuid breaks ties for events at same millisecond
--   and guarantees row uniqueness (idempotent re-inserts are safe).

CREATE TABLE IF NOT EXISTS logs_by_service_date (
    service_name  TEXT,
    log_date      DATE,           -- Derived from timestamp; used in partition key
    timestamp     TIMESTAMP,
    log_uuid      UUID,
    severity      TEXT,           -- INFO | WARN | ERROR | DEBUG
    message       TEXT,
    host          TEXT,
    metadata      MAP<TEXT, TEXT> -- Optional key-value pairs (request_id, trace_id, etc.)
) WITH CLUSTERING ORDER BY (timestamp DESC, log_uuid ASC)
  AND compaction = {
      'class': 'TimeWindowCompactionStrategy',
      'compaction_window_unit': 'DAYS',
      'compaction_window_size': 1
      -- Rationale: TWCS groups SSTables by time window, avoiding rewrites
      -- of old data. Ideal for append-only time-series workloads like logs.
  }
  AND gc_grace_seconds = 86400    -- 1-day grace period for tombstone collection
  AND comment = 'Raw log events partitioned by service and date for efficient time-range queries';

-- ============================================================
-- Secondary index on severity for filtered scans
-- ============================================================
-- Rationale: Allows GET /logs/search?severity=ERROR without a
-- full partition scan. Acceptable for low-cardinality columns
-- (only ~5 severity levels). Would use a separate table for
-- high-cardinality secondary lookups in production.
CREATE INDEX IF NOT EXISTS logs_severity_idx
    ON logs_by_service_date (severity);

-- ============================================================
-- Materialized view: logs by host (optional, label: OPTIONAL)
-- ============================================================
-- Uncomment if you need to query by host across services.
-- Kept commented out to keep local dev lightweight.

-- CREATE MATERIALIZED VIEW IF NOT EXISTS logs_by_host AS
--     SELECT * FROM logs_by_service_date
--     WHERE host IS NOT NULL AND service_name IS NOT NULL
--       AND log_date IS NOT NULL AND timestamp IS NOT NULL AND log_uuid IS NOT NULL
--     PRIMARY KEY ((host, log_date), timestamp, log_uuid)
--     WITH CLUSTERING ORDER BY (timestamp DESC, log_uuid ASC);