import { INGESTION_API, QUERY_API } from "../../lib/constants";

const STACK_ROWS = [
  ["Raw logs",   "Astra DB (Cassandra, eu-west-1)"],
  ["Aggregates", "Neon PostgreSQL (eu-west-2)"],
  ["APIs",       "FastAPI · Python 3.11"],
  ["Hosting",    "Fly.io LHR · Vercel"],
  ["UI",         "React 18 · Vite · Recharts"],
];

const COLORS = {
  light: {
    producer:  { fill: "#f5f4f0", stroke: "#e8e4dc", text: "#1a1a1a", sub: "#8a8580" },
    shipper:   { fill: "#fef2f2", stroke: "#fca5a5", text: "#b91c1c", sub: "#dc2626" },
    ingestion: { fill: "#f5f0ff", stroke: "#c4b5fd", text: "#5b21b6", sub: "#7c3aed" },
    astra:     { fill: "#e1f5ee", stroke: "#5dcaa5", text: "#085041", sub: "#0f6e56" },
    postgres:  { fill: "#e6f1fb", stroke: "#85b7eb", text: "#042c53", sub: "#185fa5" },
    query:     { fill: "#faeeda", stroke: "#ef9f27", text: "#412402", sub: "#854f0b" },
    ui:        { fill: "#eaf3de", stroke: "#97c459", text: "#173404", sub: "#3b6d11" },
    neutral:   { fill: "#f5f4f0", stroke: "#e8e4dc", text: "#1a1a1a", sub: "#8a8580" },
    flow:      "#e8002d",
    border:    "#e8e4dc",
    muted:     "#8a8580",
    text:      "#1a1a1a",
  },
  dark: {
    producer:  { fill: "#1e1e1e", stroke: "#2a2a2a", text: "#f0ede8", sub: "#555550" },
    shipper:   { fill: "#200d0d", stroke: "#4a1a1a", text: "#fca5a5", sub: "#f87171" },
    ingestion: { fill: "#1a1030", stroke: "#4a3a7a", text: "#c4b5fd", sub: "#a78bfa" },
    astra:     { fill: "#04342c", stroke: "#0f6e56", text: "#9fe1cb", sub: "#5dcaa5" },
    postgres:  { fill: "#042c53", stroke: "#185fa5", text: "#b5d4f4", sub: "#85b7eb" },
    query:     { fill: "#412402", stroke: "#854f0b", text: "#fac775", sub: "#ef9f27" },
    ui:        { fill: "#173404", stroke: "#3b6d11", text: "#c0dd97", sub: "#97c459" },
    neutral:   { fill: "#161616", stroke: "#2a2a2a", text: "#f0ede8", sub: "#555550" },
    flow:      "#e8002d",
    border:    "#2a2a2a",
    muted:     "#555550",
    text:      "#f0ede8",
  },
};

function ArchDiagram({ theme }) {
  const dk = theme === "dark";
  const c = COLORS[dk ? "dark" : "light"];

  // viewBox is 900x420 — full width horizontal pipeline
  // Columns: Producers 20-130 | Shipper 160-280 | Ingestion 310-440 | Storage 470-610 | Query+UI 640-860
  const Node = ({ x, y, w, h, col, title, sub }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7}
        fill={col.fill} stroke={col.stroke} strokeWidth={0.5} />
      <text x={x + w / 2} y={sub ? y + h / 2 - 8 : y + h / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={600} fill={col.text}
        fontFamily="'IBM Plex Mono', monospace">{title}</text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 8}
          textAnchor="middle" dominantBaseline="central"
          fontSize={9} fill={col.sub}
          fontFamily="'IBM Plex Mono', monospace">{sub}</text>
      )}
    </g>
  );

  const Flow = ({ d }) => (
    <path d={d} fill="none" stroke={c.flow} strokeWidth={1.5}
      strokeDasharray="5 4" markerEnd="url(#arr2)"
      style={{ animation: "dashFlow2 1.4s linear infinite" }} />
  );

  const Passive = ({ d }) => (
    <path d={d} fill="none" stroke={c.border} strokeWidth={0.8}
      strokeDasharray="4 3" markerEnd="url(#arr2p)" />
  );

  return (
    <svg width="100%" viewBox="0 0 900 420" style={{ display: "block" }}>
      <defs>
        <marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth={5} markerHeight={5} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke={c.flow}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id="arr2p" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth={5} markerHeight={5} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke={c.border}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <style>{`
          @keyframes dashFlow2 { to { stroke-dashoffset: -18; } }
          @keyframes dp2 { 0%,100%{opacity:1} 50%{opacity:0.4} }
          @keyframes dm1  { 0%{transform:translate(130px,210px)} 100%{transform:translate(160px,210px)} }
          @keyframes dm2  { 0%{transform:translate(285px,210px)} 100%{transform:translate(310px,210px)} }
          @keyframes dm3a { 0%{transform:translate(445px,190px)} 100%{transform:translate(470px,160px)} }
          @keyframes dm3b { 0%{transform:translate(445px,230px)} 100%{transform:translate(470px,270px)} }
          @keyframes dm4a { 0%{transform:translate(615px,160px)} 100%{transform:translate(640px,195px)} }
          @keyframes dm4b { 0%{transform:translate(615px,270px)} 100%{transform:translate(640px,235px)} }
          @keyframes dm5  { 0%{transform:translate(760px,175px)} 100%{transform:translate(680px,100px)} }
          .xd { fill:#e8002d; animation: dp2 1.2s ease-in-out infinite; }
          .xd1 { animation: dm1  1s linear infinite,       dp2 1.2s ease-in-out infinite; }
          .xd2 { animation: dm2  1s linear infinite 0.25s, dp2 1.2s ease-in-out infinite; }
          .xd3a{ animation: dm3a 0.9s linear infinite 0.5s, dp2 1.2s ease-in-out infinite; }
          .xd3b{ animation: dm3b 0.9s linear infinite 0.7s, dp2 1.2s ease-in-out infinite; }
          .xd4a{ animation: dm4a 0.9s linear infinite 0.9s, dp2 1.2s ease-in-out infinite; }
          .xd4b{ animation: dm4b 0.9s linear infinite 1.1s, dp2 1.2s ease-in-out infinite; }
          .xd5 { animation: dm5  1.1s linear infinite 1.3s, dp2 1.2s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* ── Column labels ── */}
      {[
        [20,  "PRODUCERS"],
        [168, "SHIPPER"],
        [318, "INGESTION"],
        [472, "STORAGE"],
        [648, "QUERY + UI"],
      ].map(([x, lbl]) => (
        <text key={lbl} x={x} y={18} fontSize={8} fill={c.muted} letterSpacing={1}
          fontFamily="'IBM Plex Mono', monospace">{lbl}</text>
      ))}

      {/* ── Producers (4 stacked) ── */}
      {["auth", "payment", "gateway", "+3 more"].map((name, i) => (
        <Node key={name} x={20} y={30 + i * 78} w={110} h={56}
          col={c.producer} title={name} />
      ))}

      {/* fan-in lines → shipper centre y=210 */}
      {[58, 136, 214, 292].map((y) => (
        <line key={y} x1={130} y1={y + 28} x2={160} y2={210}
          stroke={c.border} strokeWidth={0.5} fill="none" />
      ))}

      {/* ── Shipper ── */}
      <Node x={160} y={160} w={125} h={100} col={c.shipper}
        title="Shipper" sub="batch · backoff · disk" />

      {/* Shipper → Ingestion */}
      <Flow d="M285 210 L310 210" />

      {/* ── Ingestion API ── */}
      <Node x={310} y={150} w={135} h={120} col={c.ingestion}
        title="Ingestion API" sub="validate · enrich · rate limit" />

      {/* Ingestion → Astra */}
      <Flow d="M445 185 L470 155" />
      {/* Ingestion → Postgres */}
      <Flow d="M445 240 L470 278" />

      {/* ── Astra DB ── */}
      <Node x={470} y={110} w={145} h={80} col={c.astra}
        title="Astra DB" sub="Cassandra · raw logs" />

      {/* ── PostgreSQL ── */}
      <Node x={470} y={248} w={145} h={80} col={c.postgres}
        title="PostgreSQL" sub="aggregates · registry" />

      {/* Astra → Query */}
      <Flow d="M615 155 L640 200" />
      {/* Postgres → Query */}
      <Flow d="M615 278 L640 242" />

      {/* ── Query API ── */}
      <Node x={640} y={180} w={130} h={80} col={c.query}
        title="Query API" sub="search · stats · services" />

      {/* Query → React UI (up) */}
      <Flow d="M705 180 L705 110" />

      {/* ── React UI ── */}
      <Node x={560} y={60} w={290} h={46} col={c.ui}
        title="React UI" sub="Explorer · Analytics · Dark mode · Live tail" />

      {/* ── GitHub Actions (top left) ── */}
      <Node x={20} y={340} w={110} h={56} col={c.neutral}
        title="GH Actions" sub="daily cron" />
      <Passive d="M75 340 Q75 270 310 220" />

      {/* ── Prometheus (bottom) ── */}
      <Node x={160} y={340} w={110} h={56} col={c.neutral}
        title="Prometheus" sub="/metrics" />
      <Passive d="M377 270 Q377 370 270 368" />

      {/* ── Fly.io badge ── */}
      <rect x={470} y={360} width={300} height={24} rx={5}
        fill="none" stroke={c.border} strokeWidth={0.5} strokeDasharray="4 3" />
      <text x={620} y={376} textAnchor="middle" fontSize={9} fill={c.muted}
        fontFamily="'IBM Plex Mono', monospace">Fly.io · LHR (London)</text>

      {/* ── Animated dots ── */}
      <circle className="xd1"  cx={0} cy={0} r={3.5} />
      <circle className="xd2"  cx={0} cy={0} r={3.5} />
      <circle className="xd3a" cx={0} cy={0} r={3.5} />
      <circle className="xd3b" cx={0} cy={0} r={3.5} />
      <circle className="xd4a" cx={0} cy={0} r={3.5} />
      <circle className="xd4b" cx={0} cy={0} r={3.5} />
      <circle className="xd5"  cx={0} cy={0} r={3.5} />

      {/* ── Legend ── */}
      <line x1={20} y1={410} x2={44} y2={410} stroke={c.flow} strokeWidth={1.5}
        strokeDasharray="5 4" style={{ animation: "dashFlow2 1.4s linear infinite" }} />
      <text x={50} y={414} fontSize={9} fill={c.muted}
        fontFamily="'IBM Plex Mono', monospace">live data flow</text>
      <line x1={160} y1={410} x2={184} y2={410}
        stroke={c.border} strokeWidth={0.8} strokeDasharray="4 3" />
      <text x={190} y={414} fontSize={9} fill={c.muted}
        fontFamily="'IBM Plex Mono', monospace">scheduled / passive</text>
    </svg>
  );
}

export default function SystemTab({ live, coldStart, theme, t, onOpenGenerator }) {
  const dk = theme === "dark";

  const CARD = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: "16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

      {/* LEFT — full width architecture diagram */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 14, fontWeight: 500 }}>
          SYSTEM ARCHITECTURE
        </div>
        <ArchDiagram theme={theme} />
        <div style={{ fontSize: 10, color: t.muted, marginTop: 10 }}>
          Animated dots show live data moving through the pipeline.
        </div>
      </div>

      {/* RIGHT — stats column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* API status */}
        {[
          { name: "Ingestion API", url: INGESTION_API },
          { name: "Query API",     url: QUERY_API     },
        ].map((api) => (
          <div key={api.name} style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>{api.name}</span>
              <span style={{
                fontSize: 9, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
                background: live ? "#dcfce7" : dk ? "#2a2a1a" : "#fef9c3",
                color:      live ? "#15803d" : "#854d0e",
                border: `1px solid ${live ? "#bbf7d0" : "#fde68a"}`,
              }}>{live ? "Healthy" : "Unreachable"}</span>
            </div>
            <div style={{ fontSize: 9, color: t.muted, marginBottom: 6 }}>{api.url}</div>
            <div style={{ fontSize: 10, color: t.muted, display: "flex", gap: 16 }}>
              <span>Region: <span style={{ color: t.text }}>LHR</span></span>
              <span>Tier: <span style={{ color: t.text }}>Fly.io free</span></span>
            </div>
            {coldStart && (
              <div style={{
                marginTop: 8, fontSize: 9, color: "#92400e",
                background: "#fffbeb", border: "1px solid #fde68a",
                borderRadius: 6, padding: "3px 8px", display: "inline-block",
              }}>Cold start: {coldStart}s</div>
            )}
          </div>
        ))}

        {/* Generate */}
        <div style={CARD}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 10, fontWeight: 500 }}>DEMO DATA</div>
          <div style={{ fontSize: 11, color: t.muted, marginBottom: 12, lineHeight: 1.6 }}>
            Generate realistic log events and write them directly to the database.
            Use <span style={{ color: "#e8002d", fontWeight: 600 }}>⚡ Generate</span> from the header on any tab.
          </div>
          <button onClick={onOpenGenerator} style={{
            background: "#e8002d", border: "none", borderRadius: 8,
            color: "#fff", padding: "9px 16px", fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
            cursor: "pointer", letterSpacing: 0.5, width: "100%",
            transition: "opacity 0.15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >⚡ Open Log Generator</button>
        </div>

        {/* Stack */}
        <div style={CARD}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 10, fontWeight: 500 }}>STACK</div>
          {STACK_ROWS.map(([k, v]) => (
            <div key={k} style={{
              display: "flex", flexDirection: "column",
              padding: "6px 0", borderBottom: `1px solid ${t.border}`,
            }}>
              <span style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>{k}</span>
              <span style={{ fontSize: 11, color: t.text, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Free tier note */}
        <div style={{
          ...CARD,
          background: dk ? "#1a1500" : "#fffbeb",
          borderColor: "#fde68a",
        }}>
          <div style={{ fontSize: 10, color: "#92400e", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>FREE TIER NOTE</div>
          <div style={{ fontSize: 10, color: dk ? "#d97706" : "#78350f", lineHeight: 1.8 }}>
            Fly.io machines sleep after ~5 min of inactivity.<br />
            Cold starts take 5–15 seconds.<br />
            Astra DB + Neon are always-on.
          </div>
        </div>

      </div>
    </div>
  );
}