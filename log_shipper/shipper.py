import argparse
import json
import logging
import os
import time
from glob import glob
from pathlib import Path
from typing import Optional

import urllib.request
import urllib.error
import yaml

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] shipper: %(message)s",
)
logger = logging.getLogger("shipper")


# ─── Config loader ────────────────────────────────────────────────────────────

def load_config(path: str) -> dict:
    with open(path, "r") as f:
        cfg = yaml.safe_load(f)
    # Allow env var overrides for cloud deployment
    if os.getenv("INGESTION_URL"):
        cfg["ingestion"]["url"] = os.getenv("INGESTION_URL")
    if os.getenv("INGESTION_API_KEY"):
        cfg["ingestion"]["api_key"] = os.getenv("INGESTION_API_KEY")
    return cfg


# ─── Registry: byte-offset tracking ──────────────────────────────────────────
# Rationale: Storing the last read byte offset per file lets the shipper
# resume exactly where it left off after a crash or restart.
# This is the same concept as Filebeat's registry file.

class FileRegistry:
    def __init__(self, path: str):
        self.path = Path(path)
        self._data: dict[str, int] = {}
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            with open(self.path) as f:
                self._data = json.load(f)

    def _save(self) -> None:
        with open(self.path, "w") as f:
            json.dump(self._data, f)

    def get_offset(self, filepath: str) -> int:
        return self._data.get(filepath, 0)

    def set_offset(self, filepath: str, offset: int) -> None:
        self._data[filepath] = offset
        self._save()


# ─── Disk buffer ──────────────────────────────────────────────────────────────
# Rationale: When the ingestion API is unreachable, events are written to a
# local JSONL file. On recovery, the buffer is replayed before new events.
# This guarantees at-least-once delivery even across API outages.

class DiskBuffer:
    def __init__(self, path: str):
        self.path = Path(path)

    def write(self, events: list[dict]) -> None:
        with open(self.path, "a", encoding="utf-8") as f:
            for evt in events:
                f.write(json.dumps(evt) + "\n")
        logger.warning("Buffered %d events to disk → %s", len(events), self.path)

    def drain(self) -> list[dict]:
        """Read and clear all buffered events."""
        if not self.path.exists():
            return []
        events = []
        with open(self.path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        logger.warning("Skipping corrupt buffer line: %s", line[:80])
        self.path.unlink()  # Clear buffer after draining
        logger.info("Drained %d events from disk buffer", len(events))
        return events

    def has_data(self) -> bool:
        return self.path.exists() and self.path.stat().st_size > 0


# ─── HTTP sender with retry + backoff ────────────────────────────────────────
# Rationale: Using stdlib urllib (not requests/httpx) to keep shipper
# dependency-free — it can run anywhere Python 3.11 is available.

def send_batch(
    events: list[dict],
    url: str,
    api_key: str,
    timeout: int,
    max_retries: int,
    initial_backoff: float,
    backoff_mult: float,
    max_backoff: float,
) -> bool:
    """
    POST events to ingestion API with exponential backoff.
    Returns True on success, False if all retries exhausted.
    """
    payload = json.dumps(events).encode("utf-8")
    endpoint = f"{url}/ingest"
    backoff = initial_backoff

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                endpoint,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": api_key,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read())
                logger.info("Sent %d events → accepted=%d", len(events), body.get("accepted", "?"))
                return True

        except urllib.error.HTTPError as e:
            logger.error("HTTP %d on attempt %d/%d: %s", e.code, attempt, max_retries, e.reason)
            # 4xx errors (bad request, auth) — don't retry, they won't recover
            if 400 <= e.code < 500:
                logger.error("Non-retryable HTTP error. Dropping batch.")
                return False

        except (urllib.error.URLError, TimeoutError, OSError) as e:
            logger.warning("Network error attempt %d/%d: %s", attempt, max_retries, e)

        if attempt < max_retries:
            logger.info("Retrying in %.1fs...", backoff)
            time.sleep(backoff)
            # Exponential backoff with cap
            backoff = min(backoff * backoff_mult, max_backoff)

    logger.error("All %d retries exhausted for batch of %d events.", max_retries, len(events))
    return False


# ─── File tailer ─────────────────────────────────────────────────────────────

def tail_file(filepath: str, offset: int) -> tuple[list[dict], int]:
    """
    Read new lines from a log file starting at byte offset.
    Returns (parsed_events, new_offset).
    Rationale: Byte offset is more reliable than line count — handles
    log rotation and partial writes correctly.
    """
    events = []
    new_offset = offset

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            f.seek(offset)
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    # Validate required fields
                    if all(k in event for k in ("timestamp", "service", "severity", "message")):
                        events.append(event)
                    else:
                        logger.debug("Skipping line missing required fields: %s", line[:80])
                except json.JSONDecodeError:
                    logger.debug("Skipping non-JSON line: %s", line[:80])
            new_offset = f.tell()
    except FileNotFoundError:
        logger.debug("File not found (may have been rotated): %s", filepath)

    return events, new_offset


# ─── Main shipper loop ────────────────────────────────────────────────────────

def run_shipper(cfg: dict, once: bool = False) -> None:
    registry = FileRegistry(cfg["registry"]["path"])
    buffer = DiskBuffer(cfg["buffer"]["path"])

    ingestion_url = cfg["ingestion"]["url"]
    api_key = cfg["ingestion"]["api_key"]
    timeout = cfg["ingestion"]["timeout_secs"]
    batch_size = cfg["batching"]["batch_size"]
    flush_interval = cfg["batching"]["flush_interval_secs"]
    poll_interval = cfg["watch"]["poll_interval_secs"]
    log_dir = cfg["watch"]["log_dir"]

    retry_cfg = cfg["retry"]

    pending: list[dict] = []
    last_flush = time.time()

    logger.info("Shipper started. Watching %s | batch=%d | flush=%.1fs",
                log_dir, batch_size, flush_interval)

    # Replay disk buffer first (events from previous outage)
    if buffer.has_data():
        buffered = buffer.drain()
        logger.info("Replaying %d buffered events from previous session...", len(buffered))
        ok = send_batch(buffered, ingestion_url, api_key, timeout,
                        retry_cfg["max_retries"], retry_cfg["initial_backoff_secs"],
                        retry_cfg["backoff_multiplier"], retry_cfg["max_backoff_secs"])
        if not ok:
            buffer.write(buffered)  # Re-buffer if still failing

    def flush(events: list[dict]) -> None:
        """Send a batch; fall back to disk buffer on failure."""
        if not events:
            return
        ok = send_batch(events, ingestion_url, api_key, timeout,
                        retry_cfg["max_retries"], retry_cfg["initial_backoff_secs"],
                        retry_cfg["backoff_multiplier"], retry_cfg["max_backoff_secs"])
        if not ok:
            buffer.write(events)

    try:
        while True:
            # Discover all .log files in watch directory
            pattern = str(Path(log_dir) / cfg["watch"]["file_pattern"])
            log_files = glob(pattern)

            for filepath in log_files:
                offset = registry.get_offset(filepath)
                new_events, new_offset = tail_file(filepath, offset)

                if new_events:
                    pending.extend(new_events)
                    registry.set_offset(filepath, new_offset)
                    logger.debug("Read %d new events from %s", len(new_events), filepath)

            # Flush when batch is full OR flush interval elapsed
            now = time.time()
            if len(pending) >= batch_size or (pending and now - last_flush >= flush_interval):
                flush(pending)
                pending = []
                last_flush = now

            if once and not log_files:
                break
            if once:
                # In --once mode: flush remaining and exit
                flush(pending)
                pending = []
                break

            time.sleep(poll_interval)

    except KeyboardInterrupt:
        logger.info("Interrupted. Flushing remaining %d events...", len(pending))
        flush(pending)
        logger.info("Shipper stopped.")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Log Shipper Agent")
    parser.add_argument("--config", default="log_shipper/config.yaml", help="Path to config.yaml")
    parser.add_argument("--once", action="store_true",
                        help="Read current log files once and exit (useful for tests)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    run_shipper(cfg, once=args.once)


if __name__ == "__main__":
    main()