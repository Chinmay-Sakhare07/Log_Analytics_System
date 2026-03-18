"""
logs_cli.py — Developer CLI for the Log Analytics System.
Uses only stdlib + two lightweight deps (typer, rich).

Install: pip install typer rich
Run:     python cli/logs_cli.py --help
         python cli/logs_cli.py search --service auth-service
         python cli/logs_cli.py stats --service payment-service
         python cli/logs_cli.py services
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich import box

app = typer.Typer(
    name="logs",
    help="Query the Log Analytics System from your terminal.",
    no_args_is_help=True,
)
console = Console()

# ─── Config from env (override in .env or shell) ─────────────────────────────
QUERY_URL = os.getenv("QUERY_URL", "http://localhost:8001")
API_KEY   = os.getenv("QUERY_API_KEY", "dev-secret-key-change-in-prod")


def _get(path: str, params: dict) -> dict | list:
    """Make an authenticated GET request to the Query API."""
    # Build query string manually (no requests dep)
    qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    url = f"{QUERY_URL}{path}?{qs}" if qs else f"{QUERY_URL}{path}"

    req = urllib.request.Request(url, headers={"X-API-Key": API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        console.print(f"[red]HTTP {e.code}: {e.reason}[/red]")
        raise typer.Exit(1)
    except urllib.error.URLError as e:
        console.print(f"[red]Cannot reach Query API at {QUERY_URL}: {e.reason}[/red]")
        console.print("[yellow]Is the server running? Try: make up[/yellow]")
        raise typer.Exit(1)


# ─── search ──────────────────────────────────────────────────────────────────

@app.command()
def search(
    service:    str            = typer.Option(...,  "--service",  "-s", help="Service name (required)"),
    severity:   Optional[str]  = typer.Option(None, "--severity", "-l", help="DEBUG|INFO|WARN|ERROR"),
    query:      Optional[str]  = typer.Option(None, "--query",    "-q", help="Keyword to search in message"),
    start:      Optional[str]  = typer.Option(None, "--start",         help="Start time ISO8601 e.g. 2026-03-17T00:00:00"),
    end:        Optional[str]  = typer.Option(None, "--end",           help="End time ISO8601"),
    limit:      int            = typer.Option(20,   "--limit",    "-n", help="Max results to return"),
    page_token: Optional[str]  = typer.Option(None, "--page-token",    help="Cursor for next page"),
    raw:        bool           = typer.Option(False,"--raw",           help="Print raw JSON instead of table"),
):
    """Search raw log events for a service."""
    params = {
        "service":    service,
        "severity":   severity,
        "q":          query,
        "start":      start,
        "end":        end,
        "limit":      limit,
        "page_token": page_token,
    }
    data = _get("/logs/search", params)

    if raw:
        console.print_json(json.dumps(data))
        return

    events = data.get("events", [])
    if not events:
        console.print("[yellow]No events found.[/yellow]")
        return

    table = Table(
        title=f"Logs — {service}",
        box=box.ROUNDED,
        show_lines=False,
        highlight=True,
    )
    table.add_column("Timestamp",  style="cyan",    no_wrap=True, width=26)
    table.add_column("Severity",   style="bold",    width=8)
    table.add_column("Host",       style="dim",     width=16)
    table.add_column("Message",    style="white",   overflow="fold")

    SEV_COLORS = {"ERROR": "red", "WARN": "yellow", "WARNING": "yellow",
                  "INFO": "green", "DEBUG": "dim"}

    for evt in events:
        sev   = evt.get("severity", "")
        color = SEV_COLORS.get(sev, "white")
        table.add_row(
            evt.get("timestamp", "")[:26],
            f"[{color}]{sev}[/{color}]",
            evt.get("host", ""),
            evt.get("message", ""),
        )

    console.print(table)
    console.print(f"[dim]Showing {len(events)} of {data.get('count', len(events))} events[/dim]")

    if data.get("next_page_token"):
        console.print(f"\n[dim]Next page: --page-token {data['next_page_token']}[/dim]")


# ─── stats ────────────────────────────────────────────────────────────────────

@app.command()
def stats(
    service: Optional[str] = typer.Option(None, "--service", "-s", help="Filter by service (omit for all)"),
    start:   Optional[str] = typer.Option(None, "--start",         help="Start time ISO8601"),
    end:     Optional[str] = typer.Option(None, "--end",           help="End time ISO8601"),
    raw:     bool          = typer.Option(False,"--raw",           help="Print raw JSON"),
):
    """Show hourly severity counts per service."""
    params = {"service": service, "start": start, "end": end}
    data = _get("/logs/stats", params)

    if raw:
        console.print_json(json.dumps(data))
        return

    if not data:
        console.print("[yellow]No stats found.[/yellow]")
        return

    table = Table(
        title="Log Stats (hourly)",
        box=box.ROUNDED,
        highlight=True,
    )
    table.add_column("Service",     style="cyan",   width=20)
    table.add_column("Hour Bucket", style="white",  width=20)
    table.add_column("ERROR",       style="red",    justify="right", width=8)
    table.add_column("WARN",        style="yellow", justify="right", width=8)
    table.add_column("INFO",        style="green",  justify="right", width=8)
    table.add_column("DEBUG",       style="dim",    justify="right", width=8)
    table.add_column("TOTAL",       style="bold",   justify="right", width=8)

    for row in data:
        table.add_row(
            row["service"],
            row["hour_bucket"][:16],
            str(row["error_count"]),
            str(row["warn_count"]),
            str(row["info_count"]),
            str(row["debug_count"]),
            str(row["total"]),
        )

    console.print(table)


# ─── services ────────────────────────────────────────────────────────────────

@app.command()
def services(
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON"),
):
    """List all known services and their last activity."""
    data = _get("/services", {})

    if raw:
        console.print_json(json.dumps(data))
        return

    if not data:
        console.print("[yellow]No services registered yet.[/yellow]")
        return

    table = Table(title="Known Services", box=box.ROUNDED, highlight=True)
    table.add_column("Service",      style="cyan",  width=22)
    table.add_column("First Seen",   style="dim",   width=22)
    table.add_column("Last Seen",    style="white", width=22)
    table.add_column("Total Events", style="bold",  justify="right", width=14)

    for svc in data:
        table.add_row(
            svc["service"],
            svc["first_seen"][:19],
            svc["last_seen"][:19],
            str(svc["total_events"]),
        )

    console.print(table)


if __name__ == "__main__":
    app()