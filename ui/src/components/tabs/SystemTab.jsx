import { INGESTION_API, QUERY_API } from "../../lib/constants";

const CARD = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };

const STACK_ROWS = [
  ["Raw logs",   "Astra DB (Cassandra, eu-west-1)"],
  ["Aggregates", "Neon PostgreSQL (eu-west-2)"],
  ["APIs",       "FastAPI · Python 3.11"],
  ["Hosting",    "Fly.io LHR · Vercel"],
  ["UI",         "React 18 · Vite · Recharts"],
];

export default function SystemTab({ live, coldStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
      {[
        { name: "Ingestion API", url: INGESTION_API },
        { name: "Query API",     url: QUERY_API     },
      ].map((api) => (
        <div key={api.name} style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>{api.name}</span>
            <span style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
              background: live ? "#dcfce7" : "#fef9c3",
              color: live ? "#15803d" : "#854d0e",
              border: `1px solid ${live ? "#bbf7d0" : "#fde68a"}`,
            }}>{live ? "Healthy" : "Unreachable"}</span>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8 }}>{api.url}</div>
          <div style={{ fontSize: 11, color: "#6b7280", display: "flex", gap: 20 }}>
            <span>Region: <span style={{ color: "#374151" }}>LHR (London)</span></span>
            <span>Tier: <span style={{ color: "#374151" }}>Fly.io free</span></span>
          </div>
          {coldStart && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
              Cold start this session: {coldStart}s
            </div>
          )}
        </div>
      ))}

      <div style={CARD}>
        <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 1, marginBottom: 12, fontWeight: 500 }}>STACK</div>
        {STACK_ROWS.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 11 }}>
            <span style={{ color: "#6b7280" }}>{k}</span>
            <span style={{ color: "#374151", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ ...CARD, background: "#fffbeb", borderColor: "#fde68a" }}>
        <div style={{ fontSize: 10, color: "#92400e", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>FREE TIER NOTE</div>
        <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.9 }}>
          Fly.io machines sleep after ~5 min of inactivity.<br />
          Cold starts take 5–15 seconds — the boot sequence handles this automatically.<br />
          Astra DB + Neon PostgreSQL are always-on free tiers.
        </div>
      </div>
    </div>
  );
}