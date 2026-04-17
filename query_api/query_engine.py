"""
query_engine.py
All DB reads for the Query API.
Astra DB (astrapy) for raw log search, Neon PostgreSQL for aggregates + services.
"""

import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import asyncpg
from astrapy import DataAPIClient
from astrapy.collection import Collection

logger = logging.getLogger(__name__)

ASTRA_KEYSPACE = os.getenv("ASTRA_KEYSPACE", "log_analytics")
ASTRA_TOKEN = os.getenv("ASTRA_TOKEN")
ASTRA_DB_ID = os.getenv("ASTRA_DB_ID")
ASTRA_DB_REGION = os.getenv("ASTRA_DB_REGION")
POSTGRES_DSN = os.getenv("POSTGRES_DSN")

_collection: Optional[Collection] = None
_pg_pool = None


# ── Astra DB ──────────────────────────────────────────────────────────────────

def get_astra_collection() -> Collection:
    global _collection
    if _collection is not None:
        return _collection

    if not all([ASTRA_TOKEN, ASTRA_DB_ID, ASTRA_DB_REGION]):
        raise RuntimeError("ASTRA_TOKEN, ASTRA_DB_ID, and ASTRA_DB_REGION must all be set")

    endpoint = f"https://{ASTRA_DB_ID}-{ASTRA_DB_REGION}.apps.astra.datastax.com"
    client = DataAPIClient(ASTRA_TOKEN)
    db = client.get_database(endpoint, keyspace=ASTRA_KEYSPACE)
    _collection = db.get_collection("logs_by_service_date")
    logger.info("Query API: Astra DB collection ready → %s", endpoint)
    return _collection


def get_astra_session():
    return get_astra_collection()


# ── PostgreSQL ─────────────────────────────────────────────────────────────────

async def get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = await asyncpg.create_pool(POSTGRES_DSN, min_size=1, max_size=5)
        logger.info("Query API: Postgres pool established")
    return _pg_pool


# ── Cleanup ───────────────────────────────────────────────────────────────────

async def close_all():
    global _collection, _pg_pool
    _collection = None
    if _pg_pool:
        await _pg_pool.close()
        _pg_pool = None
    logger.info("Query API: DB connections closed")


# ── Cursor helpers ─────────────────────────────────────────────────────────────

def encode_cursor(ts: str, doc_id: str) -> str:
    payload = json.dumps({"ts": ts, "id": doc_id})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def decode_cursor(token: str) -> tuple[str, str]:
    payload = json.loads(base64.urlsafe_b64decode(token.encode()).decode())
    return payload["ts"], payload["id"]


# ── Queries ────────────────────────────────────────────────────────────────────

def search_logs(
    service: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    severity: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    page_token: Optional[str] = None,
) -> dict:
    """
    Search raw logs from Astra DB.
    Loops over each date partition in the range for correct multi-day results.
    Cursor pagination via page_token.
    """
    from datetime import date, timedelta

    collection = get_astra_collection()

    # Strip timezone info before using for date math
    if start and start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if end and end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    # Build list of dates to query across partitions
    if start and end:
        dates = []
        current = start.date()
        while current <= end.date():
            dates.append(current.isoformat())
            current += timedelta(days=1)
    elif start:
        dates = [start.date().isoformat()]
    elif end:
        dates = [end.date().isoformat()]
    else:
        from datetime import datetime as dt
        dates = [dt.utcnow().date().isoformat()]

    # Base filter
    base_filt: dict = {"service_name": service}
    if severity:
        base_filt["severity"] = severity.upper()

    # Cursor overrides date range
    if page_token:
        cur_ts, cur_id = decode_cursor(page_token)
        dates = [cur_ts[:10]]

    # Query each date partition and merge
    all_rows = []
    for log_date in dates:
        filt = {**base_filt, "log_date": log_date}
        cursor = collection.find(
            filt,
            sort={"timestamp": -1},
            limit=limit + 1,
        )
        all_rows.extend(list(cursor))

    # Sort merged results by timestamp descending
    all_rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)

    # Keyword filter — post-fetch since Astra has no LIKE
    if q:
        kw = q.lower()
        all_rows = [r for r in all_rows if kw in r.get("message", "").lower()]

    has_next = len(all_rows) > limit
    all_rows = all_rows[:limit]

    next_cursor = None
    if has_next and all_rows:
        last = all_rows[-1]
        next_cursor = encode_cursor(last.get("timestamp", ""), last.get("log_uuid", ""))

    return {
        "results": [_doc_to_dict(r) for r in all_rows],
        "next_cursor": next_cursor,
    }


async def get_stats(
    service: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> list[dict]:
    pool = await get_pg_pool()

    # Strip timezone info before passing to asyncpg
    if start and start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if end and end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    conditions = []
    params = []

    if service:
        params.append(service)
        conditions.append(f"service_name = ${len(params)}")
    if start:
        params.append(start)
        conditions.append(f"hour_bucket >= ${len(params)}")
    if end:
        params.append(end)
        conditions.append(f"hour_bucket <= ${len(params)}")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await pool.fetch(
        f"SELECT * FROM log_aggregates {where} ORDER BY hour_bucket DESC LIMIT 500",
        *params,
    )
    return [dict(r) for r in rows]


async def get_services() -> list[dict]:
    """All known services from service_registry."""
    pool = await get_pg_pool()
    rows = await pool.fetch("SELECT * FROM service_registry ORDER BY last_seen DESC")
    return [dict(r) for r in rows]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _doc_to_dict(doc: dict) -> dict:
    return {
        "service_name": doc.get("service_name"),
        "log_date": doc.get("log_date"),
        "timestamp": doc.get("timestamp"),
        "log_uuid": doc.get("log_uuid"),
        "severity": doc.get("severity"),
        "message": doc.get("message"),
        "host": doc.get("host"),
        "metadata": doc.get("metadata") or {},
    }