"""
test_shipper.py — Unit tests for shipper logic.
No Docker or network required. Runs with: pytest tests/unit_tests/ -v
"""

import json
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sys

# Allow importing from log_shipper/
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "log_shipper"))
from shipper import FileRegistry, DiskBuffer, tail_file, send_batch


# ─── FileRegistry tests ───────────────────────────────────────────────────────

class TestFileRegistry:
    def test_default_offset_is_zero(self, tmp_path):
        reg = FileRegistry(str(tmp_path / "registry.json"))
        assert reg.get_offset("/some/file.log") == 0

    def test_set_and_get_offset(self, tmp_path):
        reg = FileRegistry(str(tmp_path / "registry.json"))
        reg.set_offset("/some/file.log", 1234)
        assert reg.get_offset("/some/file.log") == 1234

    def test_offset_persists_across_instances(self, tmp_path):
        path = str(tmp_path / "registry.json")
        reg1 = FileRegistry(path)
        reg1.set_offset("/app/auth.log", 9999)

        reg2 = FileRegistry(path)  # New instance reads from disk
        assert reg2.get_offset("/app/auth.log") == 9999

    def test_multiple_files_tracked_independently(self, tmp_path):
        reg = FileRegistry(str(tmp_path / "registry.json"))
        reg.set_offset("/logs/auth.log", 100)
        reg.set_offset("/logs/payment.log", 200)
        assert reg.get_offset("/logs/auth.log") == 100
        assert reg.get_offset("/logs/payment.log") == 200


# ─── DiskBuffer tests ─────────────────────────────────────────────────────────

class TestDiskBuffer:
    def _sample_events(self, n: int) -> list[dict]:
        return [{"service": "auth", "severity": "ERROR",
                 "message": f"msg {i}", "timestamp": "2026-03-17T00:00:00Z"}
                for i in range(n)]

    def test_write_and_drain(self, tmp_path):
        buf = DiskBuffer(str(tmp_path / "buffer.jsonl"))
        events = self._sample_events(5)
        buf.write(events)
        drained = buf.drain()
        assert len(drained) == 5
        assert drained[0]["message"] == "msg 0"

    def test_drain_clears_buffer(self, tmp_path):
        buf = DiskBuffer(str(tmp_path / "buffer.jsonl"))
        buf.write(self._sample_events(3))
        buf.drain()
        assert not buf.has_data()

    def test_has_data_false_when_empty(self, tmp_path):
        buf = DiskBuffer(str(tmp_path / "buffer.jsonl"))
        assert not buf.has_data()

    def test_multiple_writes_accumulate(self, tmp_path):
        buf = DiskBuffer(str(tmp_path / "buffer.jsonl"))
        buf.write(self._sample_events(3))
        buf.write(self._sample_events(2))
        drained = buf.drain()
        assert len(drained) == 5

    def test_corrupt_lines_are_skipped(self, tmp_path):
        path = tmp_path / "buffer.jsonl"
        path.write_text('{"valid": true}\nNOT_JSON\n{"also": "valid"}\n')
        buf = DiskBuffer(str(path))
        drained = buf.drain()
        assert len(drained) == 2


# ─── tail_file tests ──────────────────────────────────────────────────────────

class TestTailFile:
    def _write_events(self, path: Path, events: list[dict]) -> None:
        with open(path, "a") as f:
            for e in events:
                f.write(json.dumps(e) + "\n")

    def test_reads_all_events_from_offset_zero(self, tmp_path):
        p = tmp_path / "auth.log"
        self._write_events(p, [
            {"timestamp": "2026-03-17T00:00:00Z", "service": "auth",
             "severity": "INFO", "message": "ok", "host": "h1"},
        ])
        events, offset = tail_file(str(p), 0)
        assert len(events) == 1
        assert offset > 0

    def test_resumes_from_offset(self, tmp_path):
        p = tmp_path / "auth.log"
        self._write_events(p, [
            {"timestamp": "2026-03-17T00:00:00Z", "service": "auth",
             "severity": "INFO", "message": "first", "host": "h1"},
        ])
        _, offset = tail_file(str(p), 0)

        # Write second event
        self._write_events(p, [
            {"timestamp": "2026-03-17T00:01:00Z", "service": "auth",
             "severity": "ERROR", "message": "second", "host": "h1"},
        ])
        events, _ = tail_file(str(p), offset)
        assert len(events) == 1
        assert events[0]["message"] == "second"

    def test_skips_lines_missing_required_fields(self, tmp_path):
        p = tmp_path / "bad.log"
        p.write_text('{"timestamp": "2026-03-17T00:00:00Z"}\n')  # missing service etc
        events, _ = tail_file(str(p), 0)
        assert len(events) == 0

    def test_returns_empty_for_missing_file(self, tmp_path):
        events, offset = tail_file(str(tmp_path / "nonexistent.log"), 0)
        assert events == []
        assert offset == 0


# ─── send_batch retry logic tests ────────────────────────────────────────────

class TestSendBatch:
    EVENTS = [{"timestamp": "2026-03-17T00:00:00Z", "service": "auth",
               "severity": "INFO", "message": "test", "host": "h1"}]

    def _call(self, side_effects):
        with patch("urllib.request.urlopen") as mock_open:
            mock_open.side_effect = side_effects
            return send_batch(
                self.EVENTS, "http://localhost:8000", "test-key",
                timeout=5, max_retries=3,
                initial_backoff=0.01, backoff_mult=2.0, max_backoff=1.0,
            )

    def test_success_on_first_attempt(self):
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read.return_value = b'{"status":"ok","accepted":1}'

        result = self._call([mock_resp])
        assert result is True

    def test_retries_on_network_error_then_succeeds(self):
        import urllib.error
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read.return_value = b'{"status":"ok","accepted":1}'

        result = self._call([
            urllib.error.URLError("connection refused"),
            mock_resp,
        ])
        assert result is True

    def test_returns_false_after_all_retries_exhausted(self):
        import urllib.error
        result = self._call([
            urllib.error.URLError("timeout"),
            urllib.error.URLError("timeout"),
            urllib.error.URLError("timeout"),
        ])
        assert result is False

    def test_non_retryable_4xx_returns_false_immediately(self):
        import urllib.error
        err = urllib.error.HTTPError(
            url="http://x", code=401, msg="Unauthorized", hdrs={}, fp=None
        )
        result = self._call([err])
        assert result is False