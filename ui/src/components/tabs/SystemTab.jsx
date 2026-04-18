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
    producer:   { fill: "#f5f4f0", stroke: "#e8e4dc", text: "#1a1a1a", sub: "#8a8580" },
    shipper:    { fill: "#fef2f2", stroke: "#fca5a5", text: "#b91c1c", sub: "#dc2626" },
    ingestion:  { fill: "#f5f0ff", stroke: "#c4b5fd", text: "#5b21b6", sub: "#7c3aed" },
    astra:      { fill: "#e1f5ee", stroke: "#5dcaa5", text: "#085041", sub: "#0f6e56" },
    postgres:   { fill: "#e6f1fb", stroke: "#85b7eb", text: "#042c53", sub: "#185fa5" },
    query:      { fill: "#faeeda", stroke: "#ef9f27", text: "#412402", sub: "#854f0b" },
    ui:         { fill: "#eaf3de", stroke: "#97c459", text: "#173404", sub: "#3b6d11" },
    neutral:    { fill: "#f5f4f0", stroke: "#e8e4dc", text: "#1a1a1a", sub: "#8a8580" },
    flow:       "#e8002d",
    border:     "#e8e4dc",
    muted:      "#8a8580",
    text:       "#1a1a1a",
  },
  dark: {
    producer:   { fill: "#1e1e1e", stroke: "#2a2a2a", text: "#f0ede8", sub: "#555550" },
    shipper:    { fill: "#200d0d", stroke: "#4a1a1a", text: "#fca5a5", sub: "#f87171" },
    ingestion:  { fill: "#1a1030", stroke: "#4a3a7a", text: "#c4b5fd", sub: "#a78bfa" },
    astra:      { fill: "#04342c", stroke: "#0f6e56", text: "#9fe1cb", sub: "#5dcaa5" },
    postgres:   { fill: "#042c53", stroke: "#185fa5", text: "#b5d4f4", sub: "#85b7eb" },
    query:      { fill: "#412402", stroke: "#854f0b", text: "#fac775", sub: "#ef9f27" },
    ui:         { fill: "#173404", stroke: "#3b6d11", text: "#c0dd97", sub: "#97c459" },
    neutral:    { fill: "#161616", stroke: "#2a2a2a", text: "#f0ede8", sub: "#555550" },
    flow:       "#e8002d",
    border:     "#2a2a2a",
    muted:      "#555550",
    text:       "#f0ede8",
  },
};

function ArchDiagram({ theme }) {
  const dk = theme === "dark";
  const c = COLORS[dk ? "dark" : "light"];

  const Node = ({ x, y, w, h, col, title, sub, onClick }) => (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        x={x} y={y} width={w} height={h} rx={8}
        fill={col.fill} stroke={col.stroke} strokeWidth={0.5}
      />
      <text
        x={x + w / 2} y={sub ? y + h / 2 - 9 : y + h / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={12} fontWeight={600}
        fill={col.text} fontFamily="'IBM Plex Mono', monospace"
      >{title}</text>
      {sub && (
        <text
          x={x + w / 2} y={y + h / 2 + 9}
          textAnchor="middle" dominantBaseline="central"
          fontSize={10} fill={col.sub}
          fontFamily="'IBM Plex Mono', monospace"
        >{sub}</text>
      )}
    </g>
  );

  const FlowLine = ({ d, dashed = false }) => (
    <path
      d={d} fill="none"
      stroke={c.flow} strokeWidth={1.5}
      strokeDasharray={dashed ? "5 4" : "5 4"}
      markerEnd="url(#arr)"
      style={{ animation: "dashFlow 1.4s linear infinite" }}
    />
  );

  const GrayLine = ({ x1, y1, x2, y2 }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={c.border} strokeWidth={0.5} fill="none" />
  );

  return (
    <svg width="100%" viewBox="0 0 680 500" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke={c.flow}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <style>{`
          @keyframes dashFlow { to { stroke-dashoffset: -18; } }
          @keyframes dotPulse { 0%,100%{opacity:1;r:4} 50%{opacity:0.5;r:3} }
          @keyframes moveDot1 { 0%{transform:translate(130px,308px)} 100%{transform:translate(158px,308px)} }
          @keyframes moveDot2 { 0%{transform:translate(268px,308px)} 100%{transform:translate(298px,298px)} }
          @keyframes moveDot3a { 0%{transform:translate(408px,278px)} 100%{transform:translate(448px,215px)} }
          @keyframes moveDot3b { 0%{transform:translate(408px,318px)} 100%{transform:translate(448px,358px)} }
          @keyframes moveDot4a { 0%{transform:translate(568px,215px)} 100%{transform:translate(598px,278px)} }
          @keyframes moveDot4b { 0%{transform:translate(568px,358px)} 100%{transform:translate(598px,298px)} }
          @keyframes moveDot5  { 0%{transform:translate(620px,258px)} 100%{transform:translate(508px,128px)} }
          .mdot { animation: dotPulse 1.2s ease-in-out infinite; fill: #e8002d; }
          .md1  { animation: moveDot1  1s linear infinite,       dotPulse 1.2s ease-in-out infinite; }
          .md2  { animation: moveDot2  1s linear infinite 0.3s,  dotPulse 1.2s ease-in-out infinite; }
          .md3a { animation: moveDot3a 0.9s linear infinite 0.6s, dotPulse 1.2s ease-in-out infinite; }
          .md3b { animation: moveDot3b 0.9s linear infinite 0.8s, dotPulse 1.2s ease-in-out infinite; }
          .md4a { animation: moveDot4a 0.9s linear infinite 1s,  dotPulse 1.2s ease-in-out infinite; }
          .md4b { animation: moveDot4b 0.9s linear infinite 1.1s,dotPulse 1.2s ease-in-out infinite; }
          .md5  { animation: moveDot5  1.2s linear infinite 1.3s,dotPulse 1.2s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* ── Layer labels ── */}
      {[
        [30,  "Producers"],
        [170, "Shipper"],
        [300, "Ingestion"],
        [454, "Storage"],
        [590, "Query + UI"],
      ].map(([x, label]) => (
        <text key={label} x={x} y={22} fontSize={9} fill={c.muted}
          fontFamily="'IBM Plex Mono', monospace" letterSpacing={1}>
          {label.toUpperCase()}
        </text>
      ))}

      {/* ── Producer nodes ── */}
      {[
        [255, "auth"],
        [300, "payment"],
        [345, "gateway"],
        [390, "+3 more"],
      ].map(([y, label]) => (
        <Node key={label} x={20} y={y} w={110} h={32}
          col={c.producer} title={label} />
      ))}

      {/* connector lines producers → shipper */}
      {[271, 316, 361, 406].map((y) => (
        <GrayLine key={y} x1={130} y1={y} x2={158} y2={308} />
      ))}

      {/* ── Shipper ── */}
      <Node x={158} y={270} w={110} h={76} col={c.shipper}
        title="Shipper" sub="batch · backoff · disk" />

      {/* shipper → ingestion */}
      <FlowLine d="M268 308 L298 298" />

      {/* ── Ingestion API ── */}
      <Node x={298} y={250} w={110} h={116} col={c.ingestion}
        title="Ingestion API" sub="validate · enrich" />
      <text x={353} y={340} textAnchor="middle" fontSize={10}
        fill={c.ingestion.sub} fontFamily="'IBM Plex Mono', monospace">
        rate limit · metrics
      </text>

      {/* ingestion → Astra */}
      <FlowLine d="M408 278 L448 215" />
      {/* ingestion → PostgreSQL */}
      <FlowLine d="M408 318 L448 358" />

      {/* ── Astra DB ── */}
      <Node x={448} y={170} w={120} h={76} col={c.astra}
        title="Astra DB" sub="Cassandra · raw logs" />

      {/* ── PostgreSQL ── */}
      <Node x={448} y={318} w={120} h={76} col={c.postgres}
        title="PostgreSQL" sub="aggregates · registry" />

      {/* Astra → Query */}
      <FlowLine d="M568 215 L598 278" />
      {/* PostgreSQL → Query */}
      <FlowLine d="M568 358 L598 298" />

      {/* ── Query API ── */}
      <Node x={570} y={258} w={100} h={80} col={c.query}
        title="Query API" sub="search · stats" />

      {/* Query → UI */}
      <FlowLine d="M620 258 Q620 160 508 128" />

      {/* ── React UI ── */}
      <Node x={380} y={80} w={256} h={44} col={c.ui}
        title="React UI" sub="Explorer · Analytics · Dark mode" />

      {/* ── GitHub Actions ── */}
      <Node x={20} y={150} w={110} h={56} col={c.neutral}
        title="GitHub Actions" sub="daily cron" />
      {/* GH Actions → Ingestion */}
      <path d="M130 178 Q330 178 330 250" fill="none"
        stroke={c.border} strokeWidth={0.8}
        strokeDasharray="4 3" markerEnd="url(#arr)" />

      {/* ── Prometheus ── */}
      <Node x={20} y={430} w={110} h={50} col={c.neutral}
        title="Prometheus" sub="/metrics" />
      {/* Ingestion → Prometheus */}
      <path d="M353 366 Q353 455 130 455" fill="none"
        stroke={c.border} strokeWidth={0.8}
        strokeDasharray="4 3" markerEnd="url(#arr)" />

      {/* ── Fly.io badge ── */}
      <rect x={448} y={450} width={222} height={26} rx={6}
        fill="none" stroke={c.border} strokeWidth={0.5} strokeDasharray="4 3" />
      <text x={559} y={467} textAnchor="middle" fontSize={10}
        fill={c.muted} fontFamily="'IBM Plex Mono', monospace">
        Fly.io · LHR (London)
      </text>

      {/* ── Animated data dots ── */}
      <circle className="md1"  cx={0} cy={0} r={4} />
      <circle className="md2"  cx={0} cy={0} r={4} />
      <circle className="md3a" cx={0} cy={0} r={4} />
      <circle className="md3b" cx={0} cy={0} r={4} />
      <circle className="md4a" cx={0} cy={0} r={4} />
      <circle className="md4b" cx={0} cy={0} r={4} />
      <circle className="md5"  cx={0} cy={0} r={4} />

      {/* ── Legend ── */}
      <line x1={20} y1={492} x2={44} y2={492}
        stroke={c.flow} strokeWidth={1.5}
        strokeDasharray="5 4"
        style={{ animation: "dashFlow 1.4s linear infinite" }} />
      <text x={50} y={496} fontSize={10} fill={c.muted}
        fontFamily="'IBM Plex Mono', monospace">
        live data flow
      </text>
      <line x1={160} y1={492} x2={184} y2={492}
        stroke={c.border} strokeWidth={0.8} strokeDasharray="4 3" />
      <text x={190} y={496} fontSize={10} fill={c.muted}
        fontFamily="'IBM Plex Mono', monospace">
        scheduled / passive
      </text>
    </svg>
  );
}

export default function SystemTab({ live, coldStart, theme, t, onOpenGenerator }) {
  const dk = theme === "dark";

  const CARD = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10, padding: "16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 900 }}>

      {/* Architecture diagram */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>
          SYSTEM ARCHITECTURE
        </div>
        <ArchDiagram theme={theme} />
        <div style={{ fontSize: 10, color: t.muted, marginTop: 10 }}>
          Animated dots show live data moving through the pipeline.
        </div>
      </div>

      {/* API status + demo + stack in a row below */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* Left col — API status cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        </div>

        {/* Right col — Stack + free tier */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
      </div>
    </div>
  );
}