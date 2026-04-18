import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { SEVERITIES, SEV_COLOR, SEV_BG } from "../../lib/constants";

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// Fix: map API field names to chart keys
const normalizeHourly = (hourly) =>
  (hourly || []).map((row) => ({
    hour: row.hour_bucket
      ? new Date(row.hour_bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : row.hour || "",
    ERROR: row.error_count ?? row.ERROR ?? 0,
    WARN:  row.warn_count  ?? row.WARN  ?? 0,
    INFO:  row.info_count  ?? row.INFO  ?? 0,
    DEBUG: row.debug_count ?? row.DEBUG ?? 0,
  }));

// Fix: compute error_rate from counts
const enrichServices = (services) =>
  (services || []).map((s) => {
    const total = (s.total_events || 0);
    const errors = s.error_count ?? 0;
    const error_rate = total > 0 ? Math.round((errors / total) * 100) : 0;
    return { ...s, error_rate, error_count: errors };
  });

export default function Analytics({ services, hourly, theme, t }) {
  const dk = theme === "dark";
  const enriched = enrichServices(services);
  const normalized = normalizeHourly(hourly);
  const spikes = enriched.filter((s) => s.error_rate > 15);

  // Summary stats
  const totalEvents   = enriched.reduce((a, s) => a + (s.total_events || 0), 0);
  const totalErrors   = enriched.reduce((a, s) => a + (s.error_count  || 0), 0);
  const overallRate   = totalEvents > 0 ? Math.round((totalErrors / totalEvents) * 100) : 0;
  const mostActive    = [...enriched].sort((a, b) => (b.total_events || 0) - (a.total_events || 0))[0];
  const peakHour      = [...normalized].sort((a, b) =>
    (b.ERROR + b.WARN + b.INFO + b.DEBUG) - (a.ERROR + a.WARN + a.INFO + a.DEBUG)
  )[0];

  // Severity distribution for pie chart
  const sevTotals = SEVERITIES.map((sev) => ({
    name: sev,
    value: normalized.reduce((a, row) => a + (row[sev] || 0), 0),
    color: SEV_COLOR[sev],
  })).filter((s) => s.value > 0);

  // Error trend — last 12 hours
  const errorTrend = normalized.slice(-12).map((row) => ({
    hour: row.hour,
    errors: row.ERROR,
    warns:  row.WARN,
  }));

  // Top error messages — simulated from service error counts
  const topErrors = [...enriched]
    .filter((s) => s.error_count > 0)
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 5);

  const CARD = {
    background: t.cardBg,
    border: `1px solid ${t.border}`,
    borderRadius: 10, padding: "16px",
    boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
  };

  const STAT_CARD = {
    ...CARD,
    display: "flex", flexDirection: "column", gap: 4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Error spike alert */}
      {spikes.length > 0 && (
        <div style={{
          ...CARD,
          background: dk ? "#200d0d" : "#fef2f2",
          borderColor: dk ? "#4a1a1a" : "#fecaca",
        }}>
          <div style={{ fontSize: 10, color: "#991b1b", letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            ⚠ ERROR SPIKES
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {spikes.map((s) => (
              <div key={s.service_name} style={{
                background: t.cardBg, border: "1px solid #fca5a5",
                borderRadius: 8, padding: "8px 14px",
              }}>
                <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{s.service_name}</div>
                <div style={{ fontSize: 10, color: "#dc2626" }}>{s.error_rate}% error rate</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <div style={STAT_CARD}>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 2 }}>TOTAL EVENTS</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: t.text }}>{totalEvents.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: t.muted }}>across {enriched.length} services</div>
        </div>
        <div style={STAT_CARD}>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 2 }}>OVERALL ERROR RATE</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: overallRate > 10 ? "#dc2626" : overallRate > 3 ? "#d97706" : "#16a34a" }}>
            {overallRate}%
          </div>
          <div style={{ fontSize: 10, color: t.muted }}>{totalErrors.toLocaleString()} errors total</div>
        </div>
        <div style={STAT_CARD}>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 2 }}>MOST ACTIVE</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 4 }}>
            {mostActive?.service_name?.replace("-service", "") || "—"}
          </div>
          <div style={{ fontSize: 10, color: t.muted }}>{mostActive?.total_events?.toLocaleString()} events</div>
        </div>
        <div style={STAT_CARD}>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 2 }}>PEAK HOUR</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginTop: 4 }}>
            {peakHour?.hour || "—"}
          </div>
          <div style={{ fontSize: 10, color: t.muted }}>
            {peakHour ? (peakHour.ERROR + peakHour.WARN + peakHour.INFO + peakHour.DEBUG).toLocaleString() + " events" : "no data"}
          </div>
        </div>
      </div>

      {/* Service cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 10 }}>
        {enriched.map((s) => {
          const rc = s.error_rate > 10 ? "#dc2626" : s.error_rate > 3 ? "#d97706" : "#16a34a";
          const rb = s.error_rate > 10
            ? (dk ? "#200d0d" : "#fef2f2")
            : s.error_rate > 3
            ? (dk ? "#1a1200" : "#fffbeb")
            : (dk ? "#0d2010" : "#f0fdf4");
          return (
            <div key={s.service_name} style={CARD}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: t.text, fontWeight: 600 }}>
                  {s.service_name.replace("-service", "")}
                </span>
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
                      background: h > 15 ? "#fca5a5" : dk ? "#2a2a2a" : "#e5e7eb",
                    }} />
                  );
                })}
              </div>
              {/* Severity mini bars */}
              <div style={{ display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                {SEVERITIES.map((sev) => {
                  const cnt = sev === "ERROR" ? (s.error_count || 0) : rnd(10, 100);
                  return (
                    <div key={sev} style={{
                      flex: cnt, background: SEV_COLOR[sev], opacity: 0.8,
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

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>

        {/* Hourly volume bar chart */}
        <div style={CARD}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>
            HOURLY VOLUME
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={normalized} barSize={7} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: t.cardBg, border: `1px solid ${t.border}`,
                  fontSize: 11, borderRadius: 8,
                  fontFamily: "'IBM Plex Mono', monospace",
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

        {/* Severity distribution pie */}
        <div style={CARD}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 8, fontWeight: 500 }}>
            SEVERITY SPLIT
          </div>
          {sevTotals.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={sevTotals}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sevTotals.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: t.cardBg, border: `1px solid ${t.border}`,
                      fontSize: 11, borderRadius: 8,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                    formatter={(v, n) => [v.toLocaleString(), n]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {sevTotals.map((s) => {
                  const total = sevTotals.reduce((a, b) => a + b.value, 0);
                  const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                      <span style={{ color: t.muted, flex: 1 }}>{s.name}</span>
                      <span style={{ color: t.text, fontWeight: 500 }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: t.muted, textAlign: "center", padding: "40px 0" }}>No data</div>
          )}
        </div>
      </div>

      {/* Error trend line chart */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>
          ERROR TREND — LAST 12 HOURS
        </div>
        {errorTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={errorTrend} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: t.cardBg, border: `1px solid ${t.border}`,
                  fontSize: 11, borderRadius: 8,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                labelStyle={{ color: t.text }}
              />
              <Line type="monotone" dataKey="errors" stroke="#dc2626" strokeWidth={2} dot={false} name="ERROR" />
              <Line type="monotone" dataKey="warns"  stroke="#d97706" strokeWidth={2} dot={false} name="WARN"  />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ fontSize: 11, color: t.muted, textAlign: "center", padding: "40px 0" }}>No data</div>
        )}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: t.muted }}>
            <div style={{ width: 16, height: 2, background: "#dc2626", borderRadius: 1 }} /> ERROR
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: t.muted }}>
            <div style={{ width: 16, height: 2, background: "#d97706", borderRadius: 1 }} /> WARN
          </div>
        </div>
      </div>

      {/* Top services by error count */}
      <div style={CARD}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>
          TOP SERVICES BY ERROR COUNT
        </div>
        {topErrors.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topErrors.map((s, i) => {
              const maxErr = topErrors[0].error_count;
              const pct = maxErr > 0 ? (s.error_count / maxErr) * 100 : 0;
              return (
                <div key={s.service_name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: t.text }}>
                      <span style={{ color: t.muted, marginRight: 8 }}>#{i + 1}</span>
                      {s.service_name}
                    </span>
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>{s.error_count} errors</span>
                  </div>
                  <div style={{ height: 4, background: dk ? "#2a2a2a" : "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: `linear-gradient(90deg, #dc2626, #fca5a5)`,
                      borderRadius: 2, transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: t.muted, textAlign: "center", padding: "20px 0" }}>No errors recorded</div>
        )}
      </div>

    </div>
  );
}