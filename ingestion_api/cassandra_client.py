"""
cassandra_client.py
Handles all reads/writes to Cassandra (or ScyllaDB).
Rationale: Isolated in its own module so the app layer
never constructs CQL directly — all queries live here.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from cassandra.cluster import Cluster, Session
from cassandra.auth import PlainTextAuthProvider
from cassandra.policies import DCAwareRoundRobinPolicy, RetryPolicy
from cassandra.query import BatchStatement, BatchType, PreparedStatement

logger = logging.getLogger(__name__)

# ─── Module-level singletons ──────────────────────────────────────────────────
# Rationale: One Cluster + Session per process; creating a new Cluster
# per request is expensive (TCP handshake + schema negotiation).
_cluster: Optional[Cluster] = None
_session: Optional[Session] = None

# Prepared statements cached at startup
# Rationale: Cassandra parses and plans prepared statements once;
# re-using them avoids per-request parsing overhead.
_insert_stmt: Optional[PreparedStatement] = None


def get_session() -> Session:
    """Return the cached Cassandra session, initializing if needed."""
    global _cluster, _session, _insert_stmt

    if _session is not None:
        return _session

    host = os.getenv("CASSANDRA_HOST", "cassandra")
    port = int(os.getenv("CASSANDRA_PORT", "9042"))
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "log_analytics")
    username = os.getenv("SCYLLA_USERNAME", "")
    password = os.getenv("SCYLLA_PASSWORD", "")
    datacenter = os.getenv("SCYLLA_DATACENTER", "datacenter1")

    # Auth is only set when using ScyllaDB Cloud (username present)
    auth = PlainTextAuthProvider(username, password) if username else None

    _cluster = Cluster(
        contact_points=[host],
        port=port,
        auth_provider=auth,
        # Rationale: DCAwareRoundRobinPolicy routes queries to local DC first,
        # reducing cross-DC latency. Required for ScyllaDB Cloud multi-DC.
        load_balancing_policy=DCAwareRoundRobinPolicy(local_dc=datacenter),
        default_retry_policy=RetryPolicy(),
        connect_timeout=30,
    )

    _session = _cluster.connect(keyspace)
    logger.info("Cassandra session established → %s:%s / keyspace=%s", host, port, keyspace)

    # Prepare INSERT statement once at startup
    _insert_stmt = _session.prepare("""
        INSERT INTO logs_by_service_date
            (service_name, log_date, timestamp, log_uuid, severity, message, host, metadata)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
    """)
    # Rationale: QUORUM consistency ensures at least 2 replicas acknowledge
    # the write in a 3-node cluster. For local single-node dev, ONE is used.
    _insert_stmt.consistency_level = 1  # ConsistencyLevel.ONE for local dev

    return _session


def insert_log_batch(events: list[dict]) -> int:
    """
    Write a batch of log events to Cassandra in chunks of 50.
    Rationale: Cassandra enforces a batch size limit (default 5KB warning,
    hard limit ~50KB). Chunking to 50 events keeps each batch well under
    the limit regardless of message size.
    """
    session = get_session()
    CHUNK_SIZE = 50  # Safe limit well under Cassandra's batch threshold
    total_written = 0

    for i in range(0, len(events), CHUNK_SIZE):
        chunk = events[i:i + CHUNK_SIZE]
        batch = BatchStatement(batch_type=BatchType.UNLOGGED)

        for evt in chunk:
            ts: datetime = evt["timestamp"]
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            log_date = ts.date()
            log_uuid = uuid.uuid4()

            batch.add(
                _insert_stmt,
                (
                    evt["service"],
                    log_date,
                    ts,
                    log_uuid,
                    evt["severity"].upper(),
                    evt["message"],
                    evt.get("host", "unknown"),
                    evt.get("metadata") or {},
                ),
            )

        try:
            session.execute(batch)
            total_written += len(chunk)
            logger.debug("Wrote chunk of %d events to Cassandra", len(chunk))
        except Exception as exc:
            logger.error("Cassandra batch write failed: %s", exc)
            raise

    return total_written


def search_logs(
    service: str,
    log_date: str,             # "YYYY-MM-DD"
    severity: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 50,
) -> list[dict]:
    """
    Query raw log events for a service on a specific date.
    Rationale: Partition key (service_name, log_date) is always required
    to avoid a full table scan (ALLOW FILTERING is deliberately not used).
    """
    session = get_session()

    # Build CQL dynamically based on optional filters
    cql = """
        SELECT service_name, log_date, timestamp, log_uuid,
               severity, message, host, metadata
        FROM logs_by_service_date
        WHERE service_name = %s
          AND log_date = %s
    """
    params: list = [service, log_date]

    if start:
        cql += " AND timestamp >= %s"
        params.append(start)
    if end:
        cql += " AND timestamp <= %s"
        params.append(end)
    if severity:
        cql += " AND severity = %s"
        params.append(severity.upper())

    cql += f" LIMIT {limit}"

    rows = session.execute(cql, params)
    return [
        {
            "service": r.service_name,
            "log_date": str(r.log_date),
            "timestamp": r.timestamp.isoformat(),
            "uuid": str(r.log_uuid),
            "severity": r.severity,
            "message": r.message,
            "host": r.host,
            "metadata": dict(r.metadata) if r.metadata else {},
        }
        for r in rows
    ]


def close() -> None:
    """Cleanly shut down the Cassandra cluster connection."""
    global _cluster, _session
    if _cluster:
        _cluster.shutdown()
        _cluster = None
        _session = None