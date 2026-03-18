"""
generate_logs.py — Simulates multiple services writing structured logs to files.
Each service gets its own .log file in the output directory.
Run: python log_producer/generate_logs.py --duration 30 --output-dir ./logs
"""

import argparse
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

# ─── Simulated services and their realistic log templates ────────────────────
SERVICES: dict[str, dict] = {
    "auth-service": {
        "host": "auth-host-1",
        "messages": {
            "INFO":  [
                "User login successful for user_id={uid}",
                "Token issued for user_id={uid}, expires_in=3600s",
                "Password reset email sent to user_id={uid}",
            ],
            "WARN":  [
                "Failed login attempt for user_id={uid}, attempt={n}/5",
                "Token near expiry for user_id={uid}",
                "Rate limit threshold approaching for ip={ip}",
            ],
            "ERROR": [
                "Authentication failed: invalid credentials for user_id={uid}",
                "Token validation error: signature mismatch",
                "Database connection timeout during auth check",
            ],
            "DEBUG": [
                "Auth middleware invoked for path=/api/v1/profile",
                "Cache hit for session token user_id={uid}",
            ],
        },
        # Rationale: Weighted distribution mirrors real-world log ratios
        "severity_weights": {"INFO": 60, "WARN": 25, "ERROR": 10, "DEBUG": 5},
    },
    "payment-service": {
        "host": "payment-host-1",
        "messages": {
            "INFO":  [
                "Payment processed: txn_id={txn}, amount={amt}, status=SUCCESS",
                "Refund initiated: txn_id={txn}, amount={amt}",
                "Payment method validated for user_id={uid}",
            ],
            "WARN":  [
                "Payment retry attempt {n}/3 for txn_id={txn}",
                "Slow payment gateway response: {ms}ms",
                "Currency conversion rate stale, refreshing cache",
            ],
            "ERROR": [
                "Payment FAILED: txn_id={txn}, reason=insufficient_funds",
                "Gateway timeout for txn_id={txn} after {ms}ms",
                "Fraud check triggered for user_id={uid}, txn_id={txn}",
            ],
            "DEBUG": [
                "Payment payload serialized: {n} bytes",
                "Gateway selected: stripe for region=us-east",
            ],
        },
        "severity_weights": {"INFO": 55, "WARN": 25, "ERROR": 15, "DEBUG": 5},
    },
    "api-gateway": {
        "host": "gateway-host-1",
        "messages": {
            "INFO":  [
                "GET /api/v1/products 200 {ms}ms",
                "POST /api/v1/orders 201 {ms}ms",
                "DELETE /api/v1/cart/{uid} 204 {ms}ms",
            ],
            "WARN":  [
                "GET /api/v1/search 429 rate_limit_exceeded ip={ip}",
                "Upstream latency high: {ms}ms for /api/v1/payments",
                "Missing correlation header on request from ip={ip}",
            ],
            "ERROR": [
                "POST /api/v1/checkout 500 internal_error {ms}ms",
                "Circuit breaker OPEN for payment-service",
                "TLS handshake failed for client ip={ip}",
            ],
            "DEBUG": [
                "Request routed to payment-service instance-2",
                "Header X-Request-ID={uid} propagated downstream",
            ],
        },
        "severity_weights": {"INFO": 65, "WARN": 20, "ERROR": 10, "DEBUG": 5},
    },
}


def weighted_severity(weights: dict[str, int]) -> str:
    """Pick a severity level using weighted random selection."""
    levels = list(weights.keys())
    w = list(weights.values())
    return random.choices(levels, weights=w, k=1)[0]


def render_message(template: str) -> str:
    """Fill in template placeholders with random realistic values."""
    return template.format(
        uid=random.randint(1000, 9999),
        txn=f"TXN{random.randint(100000, 999999)}",
        amt=f"{random.uniform(1.0, 500.0):.2f}",
        n=random.randint(1, 5),
        ms=random.randint(50, 3000),
        ip=f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
    )


def build_log_event(service_name: str, service_cfg: dict) -> dict:
    """Build a single structured log event dict."""
    severity = weighted_severity(service_cfg["severity_weights"])
    template = random.choice(service_cfg["messages"][severity])
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": service_name,
        "severity": severity,
        "message": render_message(template),
        "host": service_cfg["host"],
        "metadata": {
            "env": "local-dev",
            "version": "1.0.0",
        },
    }


def write_log_line(file_handle, event: dict) -> None:
    """Write one JSON log line to the file (JSON Lines format)."""
    file_handle.write(json.dumps(event) + "\n")
    file_handle.flush()  # Rationale: flush ensures shipper sees lines immediately


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate multi-service log generation")
    parser.add_argument("--duration", type=int, default=30, help="How long to run (seconds)")
    parser.add_argument("--output-dir", type=str, default="./logs", help="Directory to write log files")
    parser.add_argument("--rate", type=float, default=10.0, help="Events per second across all services")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Open one file per service
    handles = {
        svc: open(out_dir / f"{svc}.log", "a", encoding="utf-8")
        for svc in SERVICES
    }

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    logger = logging.getLogger("producer")

    logger.info("Producing logs for %ds at %.1f events/sec → %s", args.duration, args.rate, out_dir)

    start = time.time()
    total = 0
    interval = 1.0 / args.rate  # seconds between events

    try:
        while time.time() - start < args.duration:
            # Pick a random service for this event
            svc_name = random.choice(list(SERVICES.keys()))
            event = build_log_event(svc_name, SERVICES[svc_name])
            write_log_line(handles[svc_name], event)
            total += 1
            time.sleep(interval)
    finally:
        for fh in handles.values():
            fh.close()

    logger.info("Done. Wrote %d events across %d services.", total, len(SERVICES))


if __name__ == "__main__":
    main()