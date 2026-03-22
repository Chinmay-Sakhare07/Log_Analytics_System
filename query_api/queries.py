"""
queries.py — All DB query logic for the Query API.
"""

import base64
import json
import logging
import os
from datetime import datetime, timezone, date, timedelta
from typing import Optional

import asyncpg
from cassandra.cluster import Cluster, Session
from cassandra.auth import PlainTextAuthProvider
from cassandra.policies import DCAwareRoundRobinPolicy

logger = logging.getLogger(__name__)

_cluster = None
_session = None


def get_cassandra_session() -> Session:
    global _cluster, _session
    if _session:
        return _session

    bundle_path = os.getenv("ASTRA_SECURE_BUNDLE_PATH", "/app/secure-connect-bundle.zip")
    client_id = os.getenv("ASTRA_CLIENT_ID")
    client_secret = os.getenv("ASTRA_CLIENT_SECRET")
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "log_analytics")

    cloud_config = {"secure_connect_bundle": bundle_path}
    auth = PlainTextAuthProvider(client_id, client_secret)

    _cluster = Cluster(
        cloud=cloud_config,
        auth_provider=auth,
        connect_timeout=30,
    )
    _session = _cluster.connect(keyspace)
    logger.info("Query API: Astra DB session ready → keyspace=%s", keyspace)
    return _session


# ─── Postgres pool ────────────────────────────────────────────────────────────
_pool: Optional[asyncpg.Pool] = None


async def get_pg_pool() -> asyncpg.Pool:
    global _pool
    if _pool:
        return _pool
    dsn = os.getenv("POSTGRES_DSN")
    _pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10)
    logger.info("Query API: Postgres pool ready")
    return _pool


# ─── Page token helpers ───────────────────────────────────────────────────────
def encode_page_token(ts: datetime, uuid_str: str) -> str:
    payload = json.dumps({"ts": ts.isoformat(), "uuid": uuid_str})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def decode_page_token(token: str) -> tuple[datetime, str]:
    payload = json.loads(base64.urlsafe_b64decode(token.encode()))
    return datetime.fromisoformat(payload["ts"]), payload["uuid"]


# ─── Query: search logs ───────────────────────────────────────────────────────
def search_logs(
    service: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    severity: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    page_token: Optional[str] = None,
) -> dict:
    session = get_cassandra_session()

    if start is None:
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if end is None:
        end = datetime.now(timezone.utc)

    dates: list[date] = []
    cur = start.date()
    while cur <= end.date():
        dates.append(cur)
        cur += timedelta(days=1)

    cursor_ts, cursor_uuid = None, None
    if page_token:
        cursor_ts, cursor_uuid = decode_page_token(page_token)

    results = []

    for log_date in dates:
        cql = """
            SELECT service_name, log_date, timestamp, log_uuid,
                   severity, message, host, metadata
            FROM logs_by_service_date
            WHERE service_name = %s
              AND log_date = %s
        """
        params: list = [service, log_date]

        if start and log_date == start.date():
            cql += " AND timestamp >= %s"
            params.append(start)
        if end and log_date == end.date():
            cql += " AND timestamp <= %s"
            params.append(end)
        if severity:
            cql += " AND severity = %s"
            params.append(severity.upper())

        if cursor_ts and log_date == cursor_ts.date():
            cql += " AND (timestamp, log_uuid) < (%s, %s)"
            params.extend([cursor_ts, cursor_uuid])

        cql += f" LIMIT {limit}"

        rows = session.execute(cql, params)
        for r in rows:
            event = {
                "service": r.service_name,
                "log_date": str(r.log_date),
                "timestamp": r.timestamp.isoformat(),
                "uuid": str(r.log_uuid),
                "severity": r.severity,
                "message": r.message,
                "host": r.host,
                "metadata": dict(r.metadata) if r.metadata else {},
            }
            if q and q.lower() not in r.message.lower():
                continue
            results.append(event)

        if len(results) >= limit:
            break

    results = results[:limit]

    next_token = None
    if len(results) == limit:
        last = results[-1]
        next_token = encode_page_token(
            datetime.fromisoformat(last["timestamp"]), last["uuid"]
        )

    return {"events": results, "count": len(results), "next_page_token": next_token}


# ─── Query: stats ─────────────────────────────────────────────────────────────
async def get_stats(
    service: Optional[str],
    start: Optional[datetime],
    end: Optional[datetime],
) -> list[dict]:
    pool = await get_pg_pool()

    query = """
        SELECT service_name, hour_bucket,
               error_count, warn_count, info_count, debug_count
        FROM log_aggregates
        WHERE 1=1
    """
    params = []
    i = 1

    if service:
        query += f" AND service_name = ${i}"; params.append(service); i += 1
    if start:
        query += f" AND hour_bucket >= ${i}"; params.append(start); i += 1
    if end:
        query += f" AND hour_bucket <= ${i}"; params.append(end); i += 1

    query += " ORDER BY hour_bucket DESC LIMIT 200"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return [
        {
            "service": r["service_name"],
            "hour_bucket": r["hour_bucket"].isoformat(),
            "error_count": r["error_count"],
            "warn_count": r["warn_count"],
            "info_count": r["info_count"],
            "debug_count": r["debug_count"],
            "total": r["error_count"] + r["warn_count"] + r["info_count"] + r["debug_count"],
        }
        for r in rows
    ]


# ─── Query: services ──────────────────────────────────────────────────────────
async def get_services() -> list[dict]:
    pool = await get_pg_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT service_name, first_seen, last_seen, total_events
            FROM service_registry
            ORDER BY last_seen DESC
        """)
    return [
        {
            "service": r["service_name"],
            "first_seen": r["first_seen"].isoformat(),
            "last_seen": r["last_seen"].isoformat(),
            "total_events": r["total_events"],
        }
        for r in rows
    ]


# ─── Cleanup ──────────────────────────────────────────────────────────────────
async def close_all() -> None:
    global _cluster, _pool
    if _cluster:
        _cluster.shutdown()
    if _pool:
        await _pool.close()