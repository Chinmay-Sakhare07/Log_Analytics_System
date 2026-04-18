import { useState, useEffect } from "react";
import { generateDemoLogs } from "../lib/api";

const STEPS = [
  "Connecting to ingestion API",
  "Generating log events",
  "Writing to Astra DB",
  "Updating PostgreSQL aggregates",
];

export default function LogGeneratorPanel({ theme, onClose, onLogsGenerated }) {
  const [minimized, setMinimized] = useState(false);
  const [running,   setRunning]   = useState(false);
  const [steps,     setSteps]     = useState([]);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState(null);
  const [count,     setCount]     = useState(20);

  const dk = theme === "dark";

  const bg      = dk ? "#161616" : "#ffffff";
  const border  = dk ? "#2a2a2a" : "#e8e4dc";
  const text     = dk ? "#f0ede8" : "#1a1a1a";
  const muted    = dk ? "#555550" : "#8a8580";
  const hdr      = dk ? "#111111" : "#f5f4f0";

  const addStep = (label, status, ms) => {
    setSteps((prev) => {
      const existing = prev.findIndex((s) => s.label === label);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { label, status, ms };
        return next;
      }
      return [...prev, { label, status, ms }];
    });
  };

  const run = async () => {
    setRunning(true);
    setDone(false);
    setError(null);
    setSteps([]);

    const t0 = Date.now();

    for (let i = 0; i < STEPS.length - 1; i++) {
      addStep(STEPS[i], "running", null);
      await new Promise((r) => setTimeout(r, 400 + i * 200));
      addStep(STEPS[i], "done", ((Date.now() - t0) / 1000).toFixed(1));
    }

    addStep(STEPS[STEPS.length - 1], "running", null);

    try {
      const result = await generateDemoLogs(count);
      addStep(STEPS[STEPS.length - 1], "done", ((Date.now() - t0) / 1000).toFixed(1));
      setDone(result.generated);
      onLogsGenerated?.();
    } catch (e) {
      addStep(STEPS[STEPS.length - 1], "error", null);
      setError("Failed — is the ingestion API running?");
    }

    setRunning(false);
  };

  // Auto-run on open
  useEffect(() => { run(); }, []); // eslint-disable-line

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: "fixed", bottom: 0, right: 32,
          background: done ? "#16a34a" : error ? "#dc2626" : "#e8002d",
          color: "#fff", padding: "6px 16px",
          borderRadius: "8px 8px 0 0",
          fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 -2px 12px rgba(0,0,0,0.15)",
          letterSpacing: 0.5, zIndex: 1000,
        }}
      >
        <span>{running ? "⚡ Generating..." : done ? `✓ ${done} events written` : error ? "✗ Failed" : "⚡ Log Generator"}</span>
        <span style={{ opacity: 0.7, fontSize: 10 }}>▲</span>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      width: 380, zIndex: 1000,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      boxShadow: dk
        ? "0 24px 48px rgba(0,0,0,0.6)"
        : "0 24px 48px rgba(0,0,0,0.12)",
      fontFamily: "'IBM Plex Mono', monospace",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: hdr,
        borderBottom: `1px solid ${border}`,
        padding: "10px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: text, letterSpacing: 0.5 }}>
          <span style={{ color: "#e8002d" }}>⚡</span> Log Generator
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMinimized(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: muted, fontSize: 14, padding: "0 4px", lineHeight: 1,
          }}>—</button>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: muted, fontSize: 14, padding: "0 4px", lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 14px" }}>

        {/* Count selector */}
        {!running && !done && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: muted }}>Events to generate:</span>
            {[10, 20, 50, 100].map((n) => (
              <button key={n} onClick={() => setCount(n)} style={{
                background: count === n ? "#e8002d" : "none",
                color: count === n ? "#fff" : muted,
                border: `1px solid ${count === n ? "#e8002d" : border}`,
                borderRadius: 6, padding: "3px 10px",
                fontSize: 10, cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace",
              }}>{n}</button>
            ))}
          </div>
        )}

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEPS.map((label) => {
            const step = steps.find((s) => s.label === label);
            const status = step?.status || "pending";
            return (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 10,
                opacity: status === "pending" ? 0.35 : 1,
                transition: "opacity 0.3s",
              }}>
                <span style={{ width: 16, textAlign: "center", fontSize: 12 }}>
                  {status === "pending" && <span style={{ color: muted }}>○</span>}
                  {status === "running" && <Spinner />}
                  {status === "done"    && <span style={{ color: "#16a34a" }}>✓</span>}
                  {status === "error"   && <span style={{ color: "#dc2626" }}>✗</span>}
                </span>
                <span style={{ fontSize: 11, color: text, flex: 1 }}>{label}</span>
                {step?.ms && (
                  <span style={{ fontSize: 10, color: muted }}>{step.ms}s</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Result */}
        {done && (
          <div style={{
            marginTop: 16, padding: "10px 12px",
            background: dk ? "#0d2010" : "#f0fdf4",
            border: `1px solid ${dk ? "#1a4a20" : "#bbf7d0"}`,
            borderRadius: 8, fontSize: 11, color: "#16a34a",
          }}>
            ✓ {done} events written — switch to Explorer to view them
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 16, padding: "10px 12px",
            background: dk ? "#200d0d" : "#fef2f2",
            border: `1px solid ${dk ? "#4a1a1a" : "#fecaca"}`,
            borderRadius: 8, fontSize: 11, color: "#dc2626",
          }}>
            ✗ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          {(done || error) && (
            <button onClick={run} style={{
              flex: 1, background: "#e8002d", border: "none",
              borderRadius: 8, color: "#fff",
              padding: "9px", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: 0.5,
            }}>⚡ Run Again</button>
          )}
          <button onClick={onClose} style={{
            flex: done || error ? 0 : 1,
            background: "none",
            border: `1px solid ${border}`,
            borderRadius: 8, color: muted,
            padding: "9px", fontSize: 11,
            cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  const [frame, setFrame] = useState(0);
  const frames = ["◐", "◓", "◑", "◒"];
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), 150);
    return () => clearInterval(t);
  }, []);
  return <span style={{ color: "#e8002d" }}>{frames[frame]}</span>;
}