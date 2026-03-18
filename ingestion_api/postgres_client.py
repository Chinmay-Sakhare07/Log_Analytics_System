"""
postgres_client.py
Handles all reads/writes to PostgreSQL.
Rationale: asyncpg is used (not psycopg2) because FastAPI is async-first;
blocking DB calls inside an async route handler stall the event loop.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

# Module-level connection pool
# Rationale: asyncpg pool (min=2, max=10) reuses TCP connections across
# requests. Creating a new connection per request adds ~20ms overhead.
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Return the cached asyncpg connection pool, creating it if needed."""
    global _pool
    if _pool is not None:
        return _pool

    dsn = os.getenv("POSTGRES_DSN", "postgresql://loguser:logpass@postgres:5432/logdb")

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    logger.info("Postgres pool created → %s", dsn.split("@")[-1])  # Log host only, not password
    return _pool


async def upsert_aggregates(events: list[dict]) -> None:
    """
    Upsert hourly severity counts for each event's service.
    Rationale: ON CONFLICT DO UPDATE avoids a read-before-write.
    Hour bucket is computed here (not in the API layer) so this
    function can be called from any context without date math.
    """
    pool = await get_pool()

    # Group events by (service_name, hour_bucket) to minimize DB round trips
    from collections import defaultdict
    buckets: dict[tuple, dict] = defaultdict(lambda: {"error": 0, "warn": 0, "info": 0, "debug": 0})

    for evt in events:
        ts: datetime = evt["timestamp"]
        # Truncate to hour boundary
        hour = ts.replace(minute=0, second=0, microsecond=0, tzinfo=None)
        key = (evt["service"], hour)
        sev = evt["severity"].upper()
        if sev == "ERROR":
            buckets[key]["error"] += 1
        elif sev == "WARN" or sev == "WARNING":
            buckets[key]["warn"] += 1
        elif sev == "INFO":
            buckets[key]["info"] += 1
        elif sev == "DEBUG":
            buckets[key]["debug"] += 1

    async with pool.acquire() as conn:
        # Rationale: executemany inside a transaction is faster than
        # individual UPSERTs — single round trip to Postgres
        async with conn.transaction():
            for (svc, hour), counts in buckets.items():
                await conn.execute("""
                    INSERT INTO log_aggregates
                        (service_name, hour_bucket, error_count, warn_count, info_count, debug_count, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (service_name, hour_bucket) DO UPDATE SET
                        error_count = log_aggregates.error_count + EXCLUDED.error_count,
                        warn_count  = log_aggregates.warn_count  + EXCLUDED.warn_count,
                        info_count  = log_aggregates.info_count  + EXCLUDED.info_count,
                        debug_count = log_aggregates.debug_count + EXCLUDED.debug_count,
                        updated_at  = NOW()
                """, svc, hour, counts["error"], counts["warn"], counts["info"], counts["debug"])

                # Also update service registry
                await conn.execute(
                    "SELECT upsert_service_registry($1, $2, $3)",
                    svc,
                    "unknown",   # host updated below if present in events
                    sum(counts.values()),
                )

    logger.debug("Upserted aggregates for %d buckets", len(buckets))


async def get_stats(
    service: Optional[str],
    start: Optional[datetime],
    end: Optional[datetime],
) -> list[dict]:
    """Fetch hourly aggregate stats from Postgres."""
    pool = await get_pool()

    query = """
        SELECT service_name, hour_bucket, error_count, warn_count, info_count, debug_count
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
        }
        for r in rows
    ]


async def get_services() -> list[dict]:
    """Return all known services and their last seen timestamp."""
    pool = await get_pool()
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


async def close() -> None:
    """Close the connection pool gracefully."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None