"""
cassandra_client.py
Handles all reads/writes to Astra DB via token-based auth (no bundle file).
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests
from cassandra.cluster import Cluster, Session
from cassandra.auth import PlainTextAuthProvider
from cassandra.policies import RetryPolicy
from cassandra.query import BatchStatement, BatchType, PreparedStatement

logger = logging.getLogger(__name__)

_cluster: Optional[Cluster] = None
_session: Optional[Session] = None
_insert_stmt: Optional[PreparedStatement] = None


def get_session() -> Session:
    """Return the cached Astra DB session using token auth."""
    global _cluster, _session, _insert_stmt

    if _session is not None:
        return _session

    # Astra DB token auth — no secure bundle needed
    # ASTRA_DB_ID:      the database UUID from the Astra dashboard URL
    # ASTRA_DB_REGION:  e.g. eu-west-2
    # ASTRA_TOKEN:      starts with AstraCS:...
    db_id = os.getenv("ASTRA_DB_ID")
    region = os.getenv("ASTRA_DB_REGION")
    token = os.getenv("ASTRA_TOKEN")
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "log_analytics")

    # Astra DB endpoint format for token-based driver connection
    host = f"{db_id}-{region}.db.astra.datastax.com"

    auth = PlainTextAuthProvider("token", token)

    _cluster = Cluster(
        cloud={"secure_connect_bundle": None},
        contact_points=[host],
        port=29042,
        auth_provider=auth,
        default_retry_policy=RetryPolicy(),
        connect_timeout=30,
    )
    _session = _cluster.connect(keyspace)
    logger.info("Astra DB session established → %s / keyspace=%s", host, keyspace)

    _insert_stmt = _session.prepare("""
        INSERT INTO logs_by_service_date
            (service_name, log_date, timestamp, log_uuid, severity, message, host, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """)
    _insert_stmt.consistency_level = 1
    return _session


def insert_log_batch(events: list[dict]) -> int:
    session = get_session()
    CHUNK_SIZE = 50
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
            logger.debug("Wrote chunk of %d events to Astra DB", len(chunk))
        except Exception as exc:
            logger.error("Astra DB batch write failed: %s", exc)
            raise

    return total_written


def search_logs(
    service: str,
    log_date: str,
    severity: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 50,
) -> list[dict]:
    session = get_session()

    cql = """
        SELECT service_name, log_date, timestamp, log_uuid,
               severity, message, host, metadata
        FROM logs_by_service_date
        WHERE service_name = %s AND log_date = %s
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
    global _cluster, _session
    if _cluster:
        _cluster.shutdown()
        _cluster = None
        _session = None