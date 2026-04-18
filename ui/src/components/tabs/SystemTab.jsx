import { INGESTION_API, QUERY_API } from "../../lib/constants";

const STACK_ROWS = [
  ["Raw logs",   "Astra DB (Cassandra, eu-west-1)"],
  ["Aggregates", "Neon PostgreSQL (eu-west-2)"],
  ["APIs",       "FastAPI · Python 3.11"],
  ["Hosting",    "Fly.io LHR · Vercel"],
  ["UI",         "React 18 · Vite · Recharts"],
];

export default function SystemTab({ live, coldStart, theme, t, onOpenGenerator }) {
  const dk = theme === "dark";

  const CARD = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10, padding: "16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>

      {/* API status cards */}
      {[
        { name: "Ingestion API", url: INGESTION_API },
        { name: "Query API",     url: QUERY_API     },
      ].map((api) => (
        <div key={api.name} style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{api.name}</span>
            <span style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
              background: live ? "#dcfce7" : dk ? "#2a2a1a" : "#fef9c3",
              color:      live ? "#15803d" : "#854d0e",
              border: `1px solid ${live ? "#bbf7d0" : "#fde68a"}`,
            }}>{live ? "Healthy" : "Unreachable"}</span>
          </div>
          <div style={{ fontSize: 10, color: t.muted, marginBottom: 8 }}>{api.url}</div>
          <div style={{ fontSize: 11, color: t.muted, display: "flex", gap: 20 }}>
            <span>Region: <span style={{ color: t.text }}>LHR (London)</span></span>
            <span>Tier: <span style={{ color: t.text }}>Fly.io free</span></span>
          </div>
          {coldStart && (
            <div style={{
              marginTop: 8, fontSize: 10, color: "#92400e",
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 6, padding: "4px 10px", display: "inline-block",
            }}>
              Cold start this session: {coldStart}s
            </div>
          )}
        </div>
      ))}

      {/* Generate demo logs */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 12, fontWeight: 500 }}>DEMO DATA</div>
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12, lineHeight: 1.7 }}>
          Generate realistic log events across all services and write them directly to the database.
          Use the <span style={{ color: "#e8002d", fontWeight: 600 }}>⚡ Generate</span> button in the header from any tab.
        </div>
        <button
          onClick={onOpenGenerator}
          style={{
            background: "#e8002d", border: "none",
            borderRadius: 8, color: "#fff",
            padding: "10px 20px", fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600, cursor: "pointer",
            letterSpacing: 0.5, width: "100%",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
        >
          ⚡ Open Log Generator
        </button>
      </div>

      {/* Stack */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 12, fontWeight: 500 }}>STACK</div>
        {STACK_ROWS.map(([k, v]) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between",
            padding: "7px 0", borderBottom: `1px solid ${t.border}`, fontSize: 11,
          }}>
            <span style={{ color: t.muted }}>{k}</span>
            <span style={{ color: t.text, fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Free tier note */}
      <div style={{
        ...CARD,
        background: dk ? "#1a1500" : "#fffbeb",
        borderColor: "#fde68a",
      }}>
        <div style={{ fontSize: 10, color: "#92400e", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>FREE TIER NOTE</div>
        <div style={{ fontSize: 11, color: dk ? "#d97706" : "#78350f", lineHeight: 1.9 }}>
          Fly.io machines sleep after ~5 min of inactivity.<br />
          Cold starts take 5–15 seconds — the boot sequence handles this automatically.<br />
          Astra DB + Neon PostgreSQL are always-on free tiers.
        </div>
      </div>
    </div>
  );
}