"""
astra_client.py
Handles all writes to Astra DB via astrapy SDK.
Token-only auth — no secure bundle, no cassandra-driver, no port 9142.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from astrapy import DataAPIClient
from astrapy.collection import Collection

logger = logging.getLogger(__name__)

_collection: Optional[Collection] = None


def get_collection() -> Collection:
    """Return the cached Astra DB collection."""
    global _collection
    if _collection is not None:
        return _collection

    token = os.getenv("ASTRA_TOKEN")
    db_id = os.getenv("ASTRA_DB_ID")
    region = os.getenv("ASTRA_DB_REGION")
    keyspace = os.getenv("ASTRA_KEYSPACE", "log_analytics")

    if not all([token, db_id, region]):
        raise RuntimeError("ASTRA_TOKEN, ASTRA_DB_ID, and ASTRA_DB_REGION must all be set")

    endpoint = f"https://{db_id}-{region}.apps.astra.datastax.com"

    client = DataAPIClient(token)
    db = client.get_database(endpoint, keyspace=keyspace)
    _collection = db.get_collection("logs_by_service_date")

    logger.info("Astra DB collection ready → %s / keyspace=%s", endpoint, keyspace)
    return _collection


def insert_log_batch(events: list[dict]) -> int:
    """Insert events in chunks of 20 (astrapy insert_many limit)."""
    collection = get_collection()
    CHUNK_SIZE = 20
    total_written = 0

    for i in range(0, len(events), CHUNK_SIZE):
        chunk = events[i:i + CHUNK_SIZE]
        docs = []

        for evt in chunk:
            ts: datetime = evt["timestamp"]
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)

            docs.append({
                "_id": str(uuid.uuid4()),
                "service_name": evt["service"],
                "log_date": ts.date().isoformat(),
                "timestamp": ts.isoformat(),
                "severity": evt["severity"].upper(),
                "message": evt["message"],
                "host": evt.get("host", "unknown"),
                "metadata": evt.get("metadata") or {},
            })

        try:
            collection.insert_many(docs)
            total_written += len(chunk)
            logger.debug("Wrote chunk of %d events to Astra DB", len(chunk))
        except Exception as exc:
            logger.error("Astra DB batch write failed: %s", exc)
            raise

    return total_written


def close() -> None:
    """No-op — astrapy uses HTTP, no persistent connection to close."""
    global _collection
    _collection = None
    logger.info("Astra DB client released")