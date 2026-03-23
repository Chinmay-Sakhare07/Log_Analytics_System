"""
app.py — Query API
Exposes search, stats, and services endpoints.
All heavy lifting is in query_engine.py; this file is purely routing.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Security
from fastapi.security.api_key import APIKeyHeader

import query_engine

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("query_api")

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Query API — warming up DB connections...")
    query_engine.get_astra_session()
    await query_engine.get_pg_pool()
    logger.info("Query API ready.")
    yield
    await query_engine.close_all()


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Log Analytics — Query API",
    description="Search logs, fetch stats, and list services.",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Auth ─────────────────────────────────────────────────────────────────────
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
VALID_API_KEY = os.getenv("QUERY_API_KEY", "dev-secret-key-change-in-prod")


def verify_key(api_key: Optional[str] = Security(API_KEY_HEADER)) -> str:
    if api_key != VALID_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/logs/search", tags=["Query"])
async def search(
    service: str = Query(..., description="Service name to search (required)"),
    severity: Optional[str] = Query(None, description="DEBUG | INFO | WARN | ERROR"),
    q: Optional[str] = Query(None, description="Keyword to match in message"),
    start: Optional[datetime] = Query(None, description="Start time (ISO8601)"),
    end: Optional[datetime] = Query(None, description="End time (ISO8601)"),
    limit: int = Query(50, ge=1, le=500),
    page_token: Optional[str] = Query(None, description="Cursor from previous response"),
    _key: str = Security(verify_key),
):
    try:
        result = query_engine.search_logs(
            service=service,
            start=start,
            end=end,
            severity=severity,
            q=q,
            limit=limit,
            page_token=page_token,
        )
        return result
    except Exception as exc:
        logger.error("Search failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/logs/stats", tags=["Query"])
async def stats(
    service: Optional[str] = Query(None, description="Filter by service (omit for all)"),
    start: Optional[datetime] = Query(None, description="Start time (ISO8601)"),
    end: Optional[datetime] = Query(None, description="End time (ISO8601)"),
    _key: str = Security(verify_key),
):
    """
    Get hourly severity counts from pre-aggregated Postgres data.

    Example curl:
        curl "http://localhost:8001/logs/stats?service=payment-service" \\
             -H "X-API-Key: dev-secret-key-change-in-prod"
    """
    try:
        return await query_engine.get_stats(service=service, start=start, end=end)
    except Exception as exc:
        logger.error("Stats failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/services", tags=["Query"])
async def services(_key: str = Security(verify_key)):
    """
    List all known services and their last activity timestamp.

    Example curl:
        curl "http://localhost:8001/services" \\
             -H "X-API-Key: dev-secret-key-change-in-prod"
    """
    try:
        return await query_engine.get_services()
    except Exception as exc:
        logger.error("Services failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/health", tags=["Ops"])
async def health():
    return {"status": "ok", "service": "query_api"}