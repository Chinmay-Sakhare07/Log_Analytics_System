"""
app.py — Ingestion API
Accepts log events from shippers, writes raw events to Astra,
and upserts hourly aggregates to PostgreSQL.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field, field_validator
from starlette.responses import Response

import postgres_client
import astra_client

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ingestion_api")

# ─── Prometheus Metrics ───────────────────────────────────────────────────────
INGEST_REQUESTS = Counter("ingest_requests_total", "Total ingest requests", ["status"])
INGEST_EVENTS   = Counter("ingest_events_total", "Total log events ingested")
INGEST_LATENCY  = Histogram("ingest_latency_seconds", "Ingest request latency")

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Ingestion API — initializing DB connections...")
    astra_client.get_collection()
    await postgres_client.get_pool()
    logger.info("DB connections ready.")
    yield
    logger.info("Shutting down — closing DB connections...")
    astra_client.close()
    await postgres_client.close()


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Log Analytics — Ingestion API",
    description="Accepts log events from shippers and writes to Astra + PostgreSQL.",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Must be added BEFORE any routes. Covers localhost dev and Vercel production.
ALLOWED_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:4173",   # Vite preview
    "http://127.0.0.1:5173",
]

# Pull any extra origins from env (set CORS_ORIGINS on Fly.io once Vercel URL is known)
# e.g. CORS_ORIGINS=https://your-app.vercel.app
extra = os.getenv("CORS_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS += [o.strip() for o in extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth ─────────────────────────────────────────────────────────────────────
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
VALID_API_KEY  = os.getenv("INGESTION_API_KEY", "dev-secret-key-change-in-prod")


def verify_api_key(api_key: Optional[str] = Security(API_KEY_HEADER)) -> str:
    if api_key != VALID_API_KEY:
        INGEST_REQUESTS.labels(status="unauthorized").inc()
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key


# ─── Models ───────────────────────────────────────────────────────────────────
class LogEvent(BaseModel):
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="ISO8601 timestamp; defaults to now if omitted",
    )
    service:  str = Field(..., min_length=1, max_length=100)
    severity: str = Field(..., pattern=r"^(DEBUG|INFO|WARN|WARNING|ERROR)$")
    message:  str = Field(..., min_length=1, max_length=10_000)
    host:     str = Field(default="unknown", max_length=255)
    metadata: Optional[dict[str, str]] = Field(default=None)

    @field_validator("timestamp", mode="before")
    @classmethod
    def ensure_utc(cls, v: Any) -> datetime:
        if isinstance(v, str):
            v = datetime.fromisoformat(v)
        if isinstance(v, datetime) and v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("severity", mode="before")
    @classmethod
    def normalize_severity(cls, v: str) -> str:
        return v.upper()


class IngestResponse(BaseModel):
    status:   str
    accepted: int


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.post("/ingest", response_model=IngestResponse, tags=["Ingestion"])
async def ingest(
    payload: LogEvent | list[LogEvent],
    _key: str = Security(verify_api_key),
):
    start = time.perf_counter()
    events: list[LogEvent] = [payload] if isinstance(payload, LogEvent) else payload

    if not events:
        raise HTTPException(status_code=422, detail="Empty event list")

    event_dicts = [e.model_dump() for e in events]

    try:
        written = astra_client.insert_log_batch(event_dicts)
        await postgres_client.upsert_aggregates(event_dicts)
    except Exception as exc:
        logger.error("Ingest failed: %s", exc, exc_info=True)
        INGEST_REQUESTS.labels(status="error").inc()
        raise HTTPException(status_code=500, detail=f"Storage error: {exc}")

    elapsed = time.perf_counter() - start
    INGEST_REQUESTS.labels(status="ok").inc()
    INGEST_EVENTS.inc(written)
    INGEST_LATENCY.observe(elapsed)
    logger.info("Ingested %d events in %.3fs", written, elapsed)
    return IngestResponse(status="ok", accepted=written)


@app.get("/health", tags=["Ops"])
async def health():
    return {"status": "ok", "service": "ingestion_api"}


@app.get("/metrics", tags=["Ops"])
async def metrics():
    if os.getenv("ENABLE_PROMETHEUS", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)