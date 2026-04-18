import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { SEVERITIES, SEV_COLOR, SEV_BG } from "../../lib/constants";

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

export default function Analytics({ services, hourly, theme, t }) {
  const dk = theme === "dark";
  const spikes = services.filter((s) => s.error_rate > 15);

  const CARD = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10, padding: "16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {spikes.length > 0 && (
        <div style={{
          ...CARD,
          background: dk ? "#200d0d" : "#fef2f2",
          borderColor: dk ? "#4a1a1a" : "#fecaca",
        }}>
          <div style={{ fontSize: 10, color: "#991b1b", letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>ERROR SPIKES</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {spikes.map((s) => (
              <div key={s.service_name} style={{
                background: t.cardBg,
                border: "1px solid #fca5a5",
                borderRadius: 8, padding: "8px 14px",
              }}>
                <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{s.service_name}</div>
                <div style={{ fontSize: 10, color: "#dc2626" }}>{s.error_rate}% error rate</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 10 }}>
        {services.map((s) => {
          const rc = s.error_rate > 10 ? "#dc2626" : s.error_rate > 3 ? "#d97706" : "#16a34a";
          const rb = s.error_rate > 10
            ? (dk ? "#200d0d" : "#fef2f2")
            : s.error_rate > 3
            ? (dk ? "#1a1200" : "#fffbeb")
            : (dk ? "#0d2010" : "#f0fdf4");
          return (
            <div key={s.service_name} style={CARD}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: t.text, fontWeight: 600 }}>{s.service_name}</span>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: rb, color: rc, fontWeight: 600 }}>
                  {s.error_rate}%
                </span>
              </div>
              {/* Sparkline */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24, marginBottom: 10 }}>
                {Array.from({ length: 14 }, (_, i) => {
                  const h = rnd(2, 20);
                  return (
                    <div key={i} style={{
                      flex: 1, height: h, borderRadius: 2,
                      background: h > 15
                        ? "#fca5a5"
                        : dk ? "#2a2a2a" : "#e5e7eb",
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: t.muted, display: "flex", gap: 12 }}>
                <span><span style={{ color: t.text, fontWeight: 500 }}>{s.total_events?.toLocaleString()}</span> events</span>
                <span><span style={{ color: "#dc2626", fontWeight: 500 }}>{s.error_count}</span> err</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hourly chart */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>HOURLY VOLUME</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourly} barSize={7} margin={{ left: -20, right: 8 }}>
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: t.cardBg,
                border: `1px solid ${t.border}`,
                fontSize: 11, borderRadius: 8,
                fontFamily: "'IBM Plex Mono', monospace",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: t.text }}
              itemStyle={{ color: t.muted }}
            />
            {SEVERITIES.map((s) => (
              <Bar key={s} dataKey={s} stackId="a" fill={SEV_COLOR[s]}
                radius={s === "DEBUG" ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
          {SEVERITIES.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: t.muted }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: SEV_COLOR[s] }} />
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}