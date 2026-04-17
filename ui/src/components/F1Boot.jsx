import { useBootSequence } from "../hooks/useBootSequence";
import { INGESTION_API, QUERY_API, MAX_ATTEMPTS, POLL_INTERVAL } from "../lib/constants";

/**
 * light state → visual props
 * "off"   = unlit grey
 * "red"   = lit red + pulse
 * "green" = lit green + flash
 * "dark"  = dimmed grey (post-fail)
 */
function lightStyle(state) {
  switch (state) {
    case "red":   return { bg: "#e8002d", border: "#991b1b", anim: "red-pulse 1.2s ease-in-out infinite" };
    case "green": return { bg: "#16a34a", border: "#15803d", anim: "green-flash 0.45s ease-in-out infinite" };
    case "dark":  return { bg: "#d1d5db", border: "#9ca3af", anim: "none" };
    default:      return { bg: "#f3f4f6", border: "#e5e7eb", anim: "none" };
  }
}

export default function F1Boot({ onReady }) {
  const {
    attempt, lights, phase,
    countdown, termLogs, apiState,
  } = useBootSequence(onReady);

  const isSequencing = phase === "go_seq" || phase === "fail_seq";

  return (
    <div style={{
      minHeight: "100vh", background: "#f8f9fa",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace", padding: "32px 20px", boxSizing: "border-box",
      userSelect: "none",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');

        @keyframes red-pulse {
          0%,100% { box-shadow: 0 0 14px #e8002daa, 0 0 28px #e8002d55; }
          50%      { box-shadow: 0 0 4px  #e8002d33; }
        }
        @keyframes green-flash {
          0%,100% { box-shadow: 0 0 18px #16a34aaa, 0 0 36px #16a34a55; }
          50%      { box-shadow: 0 0 5px  #16a34a22; }
        }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes go-scale  { 0%{transform:scale(0.85);opacity:0} 60%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
        @keyframes fade-in   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes bar-drain { from{width:100%} to{width:0%} }
        @keyframes fade-up   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 4, textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#9ca3af", marginBottom: 2 }}>
          DISTRIBUTED LOG ANALYTICS
        </div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#d1d5db" }}>
          INFRASTRUCTURE BOOT SEQUENCE
        </div>
      </div>

      {/* Free tier pill */}
      <div style={{
        margin: "16px 0 26px", padding: "6px 18px", borderRadius: 20,
        border: "1px solid #fde68a", background: "#fffbeb",
        fontSize: 10, color: "#92400e", textAlign: "center",
      }}>
          Free tier · Fly.io may cold-start (5–15s) · up to {MAX_ATTEMPTS} attempts every {POLL_INTERVAL / 1000}s
      </div>

      {/* ── F1 LIGHTS ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 26 }}>
        {lights.map((state, i) => {
          const { bg, border, anim } = lightStyle(state);
          return (
            <div key={i} style={{
              width: 70, background: "#fff", borderRadius: 10,
              border: `2px solid ${border}`,
              padding: "9px 0",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              boxShadow: "0 2px 6px rgba(0,0,0,0.07)",
              transition: "border-color 0.3s",
            }}>
              {/* Top bulb — always unlit */}
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#f3f4f6", border: "1px solid #e5e7eb" }} />
              {/* Middle bulb */}
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: bg, border: `1px solid ${border}`,
                animation: anim, transition: "background 0.2s, border-color 0.2s",
              }} />
              {/* Bottom bulb — mirrors middle */}
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: bg, border: `1px solid ${border}`,
                animation: anim, transition: "background 0.2s, border-color 0.2s",
              }} />
            </div>
          );
        })}
      </div>

      {/* Phase banners */}
      {(phase === "go" || phase === "go_seq") && (
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: 6, color: "#15803d",
          animation: "go-scale 0.4s ease forwards", marginBottom: 14,
        }}>LIGHTS OUT — GO!</div>
      )}
      {(phase === "fail" || phase === "fail_seq") && (
        <div style={{
          fontSize: 14, color: "#b91c1c", letterSpacing: 3, marginBottom: 14,
          animation: "fade-up 0.4s ease",
        }}>HISTORICAL DATA MODE</div>
      )}

      {/* API status cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { key: "ingestion", label: "INGESTION API", url: INGESTION_API },
          { key: "query",     label: "QUERY API",     url: QUERY_API     },
        ].map(({ key, label, url }) => {
          const s = apiState[key];
          const dotColor = s.status === "ok" ? "#16a34a" : s.status === "fail" ? "#dc2626" : s.status === "checking" ? "#d97706" : "#9ca3af";
          const txtColor = s.status === "ok" ? "#15803d" : s.status === "fail" ? "#b91c1c" : s.status === "checking" ? "#92400e" : "#9ca3af";
          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "12px 18px", minWidth: 220,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%", background: dotColor,
                  animation: s.status === "checking" ? "blink 0.8s infinite" : "none",
                }} />
                <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: 1 }}>{label}</span>
              </div>
              <div style={{ fontSize: 9, color: "#d1d5db", marginBottom: 5 }}>
                {url.replace("https://", "")}
              </div>
              <div style={{ fontSize: 11, color: txtColor, fontWeight: 500 }}>
                {s.status === "idle"     && "—"}
                {s.status === "checking" && "pinging…"}
                {s.status === "ok"       && `200 OK · ${s.ms}ms`}
                {s.status === "fail"     && "unreachable"}
              </div>
              {s.cold && <div style={{ fontSize: 9, color: "#92400e", marginTop: 4 }}>{s.cold}</div>}
            </div>
          );
        })}
      </div>

      {/* Attempt counter — hide during sequences */}
      {attempt > 0 && !isSequencing && phase !== "go" && phase !== "fail" && (
        <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: 1, marginBottom: 10, textAlign: "center" }}>
          ATTEMPT {attempt} / {MAX_ATTEMPTS}
          {countdown != null && <span style={{ color: "#6b7280" }}> · next in {countdown}s</span>}
        </div>
      )}

      {/* Countdown bar */}
      {countdown != null && !isSequencing && (
        <div style={{ width: 260, height: 3, background: "#e5e7eb", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: "#d97706", borderRadius: 2,
            animation: `bar-drain ${POLL_INTERVAL / 1000}s linear forwards`,
          }} />
        </div>
      )}

      {/* Terminal log — dark terminal stays as contrast element */}
      <div style={{
        width: "100%", maxWidth: 460,
        background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: 10,
        padding: "12px 16px", minHeight: 96,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: 9, color: "#4b5563", letterSpacing: 2, marginBottom: 8 }}>SYSTEM LOG</div>
        {termLogs.length === 0 && <div style={{ fontSize: 10, color: "#374151" }}>initializing…</div>}
        {termLogs.map((l) => (
          <div key={l.id} style={{
            fontSize: 10, lineHeight: 1.9,
            color: l.type === "ok" ? "#4ade80" : l.type === "err" ? "#f87171" : l.type === "go" ? "#4ade80" : l.type === "warn" ? "#fbbf24" : "#6b7280",
            animation: "fade-in 0.25s ease",
          }}>
            <span style={{ color: "#374151" }}>{l.t} </span>{l.msg}
          </div>
        ))}
        {(apiState.ingestion.status === "checking" || apiState.query.status === "checking") && (
          <span style={{ fontSize: 10, color: "#374151", animation: "blink 1s infinite" }}>▋</span>
        )}
      </div>
    </div>
  );
}