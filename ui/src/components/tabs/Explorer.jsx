import { useState, Fragment } from "react";
import { SERVICES, SEVERITIES, SEV_COLOR, SEV_BG, TIME_PRESETS } from "../../lib/constants";

export default function Explorer({ q, theme, t }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const dk = theme === "dark";

  const CARD  = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10, padding: "14px 16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };
  const INPUT = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 6, color: t.text,
    padding: "7px 10px", fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
    width: "100%", boxSizing: "border-box",
  };
  const LABEL = {
    fontSize: 9, color: t.muted,
    letterSpacing: 2, marginBottom: 10,
    textTransform: "uppercase",
  };

  const {
    selSvc, setSelSvc, timePreset, setTimePreset,
    dateFrom, setDateFrom, dateTo, setDateTo,
    activeSevs, toggleSev, liveKeyword, setLiveKeyword,
    logs, loading, hasNext, prevStack, goNext, goPrev,
    history, replayHistory, tailMode, setTailMode,
    exportCSV, runQuery, queryError,
  } = q;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 16, alignItems: "start" }}>

      {/* ── Query Builder ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        <div style={CARD}>
          <div style={LABEL}>Service</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {SERVICES.map((s) => (
              <button key={s} className="pill-btn" onClick={() => setSelSvc((p) => p === s ? "" : s)} style={{
                fontSize: 10, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
                background: selSvc === s ? "#fef2f2" : dk ? "#1e1e1e" : "#f9fafb",
                border: `1px solid ${selSvc === s ? "#fca5a5" : t.border}`,
                color: selSvc === s ? "#b91c1c" : t.muted,
                fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.1s",
              }}>{s.replace("-service", "")}</button>
            ))}
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>Time Range</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {TIME_PRESETS.map((p) => (
              <button key={p} className="pill-btn" onClick={() => setTimePreset(p)} style={{
                fontSize: 10, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
                background: timePreset === p ? (dk ? "#1e2a3a" : "#eff6ff") : (dk ? "#1e1e1e" : "#f9fafb"),
                border: `1px solid ${timePreset === p ? "#93c5fd" : t.border}`,
                color: timePreset === p ? "#1d4ed8" : t.muted,
                fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.1s",
              }}>{p}</button>
            ))}
          </div>
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setTimePreset("custom"); }}
            style={{ ...INPUT, marginBottom: 6, fontSize: 11,
              colorScheme: dk ? "dark" : "light" }} />
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setTimePreset("custom"); }}
            style={{ ...INPUT, fontSize: 11,
              colorScheme: dk ? "dark" : "light" }} />
        </div>

        <div style={CARD}>
          <div style={LABEL}>Severity</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {SEVERITIES.map((s) => {
              const c  = SEV_COLOR[s];
              const bg = SEV_BG[s];
              return (
                <button key={s} className="pill-btn" onClick={() => toggleSev(s)} style={{
                  fontSize: 10, padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                  background: activeSevs.has(s) ? (dk ? c + "22" : bg) : (dk ? "#1e1e1e" : "#f9fafb"),
                  border: `1px solid ${activeSevs.has(s) ? c + "66" : t.border}`,
                  color: activeSevs.has(s) ? c : t.muted,
                  fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.1s",
                  fontWeight: activeSevs.has(s) ? 600 : 400,
                }}>{s}</button>
              );
            })}
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>Keyword</div>
          <input value={liveKeyword} onChange={(e) => setLiveKeyword(e.target.value)}
            placeholder="filter messages…" style={INPUT} />
        </div>

        <button onClick={() => runQuery(null)} style={{
          background: "#e8002d", border: "none", borderRadius: 8,
          color: "#fff", padding: "11px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", letterSpacing: 1,
          fontFamily: "'IBM Plex Mono', monospace",
          boxShadow: "0 2px 8px rgba(232,0,45,0.3)",
          transition: "opacity 0.15s",
        }}>▶  Run Query</button>

        <button onClick={() => setTailMode((t) => !t)} style={{
          background: tailMode ? (dk ? "#0d2010" : "#f0fdf4") : (dk ? "#1e1e1e" : "#f9fafb"),
          border: `1px solid ${tailMode ? "#86efac" : t.border}`,
          borderRadius: 8, color: tailMode ? "#15803d" : t.muted,
          padding: "9px", fontSize: 10, cursor: "pointer",
          fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.15s",
        }}>{tailMode ? "◉ Tail active (10s)" : "○ Tail mode"}</button>

        {history.length > 0 && (
          <div style={CARD}>
            <div style={LABEL}>History</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 150, overflowY: "auto" }}>
              {history.map((h) => (
                <div key={h.id} onClick={() => replayHistory(h)} style={{
                  display: "flex", gap: 8, fontSize: 10, color: t.muted,
                  cursor: "pointer", padding: "4px 6px", borderRadius: 4,
                  transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <span style={{ color: t.border }}>{h.time}</span>
                  <span style={{ color: t.text }}>{h.svc}</span>
                  {h.kw !== "—" && <span style={{ color: "#e8002d" }}>{h.kw}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {queryError && (
          <div style={{
            background: dk ? "#200d0d" : "#fef2f2",
            border: `1px solid ${dk ? "#4a1a1a" : "#fca5a5"}`,
            borderRadius: 8, padding: "8px 14px",
            fontSize: 11, color: "#b91c1c",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⚠</span> {queryError}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <div style={{ fontSize: 11, color: t.muted }}>
            {loading ? "Querying…" : `${logs.length} events`}
            {tailMode && <span style={{ color: "#15803d", marginLeft: 8 }}>● Live tail</span>}
          </div>
          <button onClick={exportCSV} style={{
            background: t.cardBg, border: `1px solid ${t.border}`,
            borderRadius: 6, color: t.text,
            padding: "5px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "'IBM Plex Mono', monospace",
          }}>↓ Export CSV</button>
        </div>

        <div style={{
          background: t.cardBg,
          border: `1px solid ${t.border}`,
          borderRadius: 10, overflow: "hidden",
          boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 20 }} /><col style={{ width: 85 }} /><col style={{ width: 60 }} />
                <col style={{ width: 140 }} /><col /><col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr style={{ background: dk ? "#111111" : "#f8fafc", borderBottom: `1px solid ${t.border}` }}>
                  {["", "Time", "Sev", "Service", "Message", "Host"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "9px 12px", fontSize: 10,
                      color: t.muted, letterSpacing: 0.5, fontWeight: 500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: t.muted, fontSize: 11 }}>Querying…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: t.muted, fontSize: 11 }}>
                    Select a service and run a query
                  </td></tr>
                ) : logs.map((l, i) => {
                  const c   = SEV_COLOR[l.severity] || "#6b7280";
                  const bg  = SEV_BG[l.severity]    || "#f9fafb";
                  const isExp = expandedRow === i;
                  const rowKey = l.log_uuid || l.doc_id || `row-${i}`;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="row-hover"
                        onClick={() => setExpandedRow(isExp ? null : i)}
                        style={{
                          borderBottom: `1px solid ${t.border}`,
                          cursor: "pointer", transition: "background 0.08s",
                          animation: i === 0 && tailMode ? "newRow 1.5s ease forwards" : "slideIn 0.2s ease",
                        }}>
                        <td style={{ padding: "7px 12px", color: t.muted, fontSize: 10 }}>{isExp ? "▾" : "▸"}</td>
                        <td style={{ padding: "7px 12px", color: t.muted, fontSize: 10, whiteSpace: "nowrap" }}>
                          {new Date(l.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{
                            fontSize: 9, padding: "2px 7px", borderRadius: 20,
                            background: dk ? c + "22" : bg,
                            color: c, fontWeight: 600,
                          }}>{l.severity}</span>
                        </td>
                        <td style={{ padding: "7px 12px", color: t.text, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.service_name}
                        </td>
                        <td style={{ padding: "7px 12px", color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.message}
                        </td>
                        <td style={{ padding: "7px 12px", color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {l.host || "—"}
                        </td>
                      </tr>
                      {isExp && (
                        <tr>
                          <td colSpan={6} style={{ padding: "0 12px 12px 28px", background: dk ? "#111111" : "#f8fafc" }}>
                            <pre style={{
                              margin: 0, fontSize: 11, color: t.text, lineHeight: 1.8,
                              background: t.cardBg, border: `1px solid ${t.border}`,
                              borderRadius: 6, padding: "12px 16px", overflowX: "auto",
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}>{JSON.stringify(l, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {logs.length > 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 16px", borderTop: `1px solid ${t.border}`,
              background: dk ? "#111111" : "#f8fafc",
            }}>
              <button disabled={prevStack.length === 0} onClick={goPrev} style={{
                background: t.cardBg, border: `1px solid ${t.border}`,
                borderRadius: 6, color: t.text,
                padding: "4px 14px", fontSize: 11,
                cursor: prevStack.length ? "pointer" : "not-allowed",
                opacity: prevStack.length ? 1 : 0.4,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>← Prev</button>
              <span style={{ fontSize: 10, color: t.muted }}>{logs.length} rows</span>
              <button disabled={!hasNext} onClick={goNext} style={{
                background: t.cardBg, border: `1px solid ${t.border}`,
                borderRadius: 6, color: t.text,
                padding: "4px 14px", fontSize: 11,
                cursor: hasNext ? "pointer" : "not-allowed",
                opacity: hasNext ? 1 : 0.4,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}