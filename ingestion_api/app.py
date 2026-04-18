"""
app.py — Ingestion API
Accepts log events from shippers, writes raw events to Astra,
and upserts hourly aggregates to PostgreSQL.
"""

import logging
import os
import time
import random
import uuid
from datetime import datetime, timezone

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

DEMO_SERVICES = {
    "auth-service": {
        "host": "auth-host-1",
        "messages": {
            "INFO":  ["User login successful for user_id={uid}", "Token issued for user_id={uid}"],
            "WARN":  ["Failed login attempt for user_id={uid}", "Rate limit approaching for ip={ip}"],
            "ERROR": ["Authentication failed for user_id={uid}", "Database connection timeout"],
            "DEBUG": ["Cache hit for session token user_id={uid}"],
        },
        "weights": {"INFO": 60, "WARN": 25, "ERROR": 10, "DEBUG": 5},
    },
    "payment-service": {
        "host": "payment-host-1",
        "messages": {
            "INFO":  ["Payment processed: txn_id={txn} amount={amt}", "Refund initiated: txn_id={txn}"],
            "WARN":  ["Payment retry attempt for txn_id={txn}", "Slow gateway response: {ms}ms"],
            "ERROR": ["Payment FAILED: txn_id={txn} insufficient_funds", "Gateway timeout after {ms}ms"],
            "DEBUG": ["Gateway selected: stripe for region=us-east"],
        },
        "weights": {"INFO": 55, "WARN": 25, "ERROR": 15, "DEBUG": 5},
    },
    "api-gateway": {
        "host": "gateway-host-1",
        "messages": {
            "INFO":  ["GET /api/v1/products 200 {ms}ms", "POST /api/v1/orders 201 {ms}ms"],
            "WARN":  ["GET /api/v1/search 429 rate_limit_exceeded", "Upstream latency high: {ms}ms"],
            "ERROR": ["POST /api/v1/checkout 500 internal_error", "Circuit breaker OPEN for payment-service"],
            "DEBUG": ["Request routed to payment-service instance-2"],
        },
        "weights": {"INFO": 65, "WARN": 20, "ERROR": 10, "DEBUG": 5},
    },
    "notification-service": {
    "host": "notification-host-1",
    "messages": {
        "INFO":  [
            "Email sent to user_id={uid}, template=welcome",
            "Push notification delivered to device_id={uid}",
            "SMS dispatched to user_id={uid}, status=delivered",
        ],
        "WARN":  [
            "Email bounce detected for user_id={uid}",
            "Push notification delivery delayed {ms}ms",
            "SMS rate limit approaching for region=us-east",
        ],
        "ERROR": [
            "Email delivery failed for user_id={uid}: SMTP timeout",
            "Push notification rejected: invalid device token",
            "Notification queue overflow, dropping events",
        ],
        "DEBUG": [
            "Notification template rendered for user_id={uid}",
            "Webhook callback received for notification_id={uid}",
        ],
    },
    "weights": {"INFO": 60, "WARN": 25, "ERROR": 10, "DEBUG": 5},
    },
    "report-service": {
        "host": "report-host-1",
        "messages": {
            "INFO":  [
                "Report generated: type=monthly, user_id={uid}, rows={n}",
                "CSV export completed for user_id={uid}, size={ms}kb",
                "Scheduled report dispatched to user_id={uid}",
            ],
            "WARN":  [
                "Report generation slow: {ms}ms for user_id={uid}",
                "Large dataset detected: {n} rows, consider pagination",
                "Report cache miss for user_id={uid}, regenerating",
            ],
            "ERROR": [
                "Report generation failed for user_id={uid}: timeout",
                "PDF rendering error for report_id={uid}",
                "Report storage write failed: disk quota exceeded",
            ],
            "DEBUG": [
                "Report query plan optimized for user_id={uid}",
                "Cache hit for report_id={uid}",
            ],
        },
        "weights": {"INFO": 55, "WARN": 25, "ERROR": 12, "DEBUG": 8},
    }
}


def _pick_severity(weights: dict) -> str:
    levels = list(weights.keys())
    w = list(weights.values())
    return random.choices(levels, weights=w, k=1)[0]


def _make_message(template: str) -> str:
    return template.format(
        uid=random.randint(1000, 9999),
        ip=f"192.168.{random.randint(0,255)}.{random.randint(0,255)}",
        txn=str(uuid.uuid4())[:8],
        amt=round(random.uniform(10, 500), 2),
        ms=random.randint(50, 3000),
        n=random.randint(1, 5),
    )


@app.post("/demo/generate", tags=["Demo"])
async def demo_generate(
    count: int = 20,
    _key: str = Security(verify_api_key),
):
    """Generate fake log events and ingest them directly."""
    events = []
    now = datetime.now(timezone.utc)

    for _ in range(count):
        service_name = random.choice(list(DEMO_SERVICES.keys()))
        svc = DEMO_SERVICES[service_name]
        severity = _pick_severity(svc["weights"])
        template = random.choice(svc["messages"][severity])

        events.append({
            "timestamp": now,
            "service": service_name,
            "severity": severity,
            "message": _make_message(template),
            "host": svc["host"],
            "metadata": {"source": "demo_generator"},
        })

    event_dicts = [e for e in events]
    # Convert datetime to isoformat for astra_client
    for e in event_dicts:
        e["timestamp"] = e["timestamp"]

    try:
        written = astra_client.insert_log_batch(event_dicts)
        await postgres_client.upsert_aggregates(event_dicts)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "ok", "generated": written}