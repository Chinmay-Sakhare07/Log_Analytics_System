import { useState, useEffect } from "react";
import { useLogQuery } from "../hooks/useLogQuery";
import Explorer  from "./tabs/Explorer";
import Analytics from "./tabs/Analytics";
import SystemTab from "./tabs/SystemTab";

const TABS = [
  ["explorer",  "Explorer"],
  ["analytics", "Analytics"],
  ["system",    "System"],
];

export default function Dashboard({ live, coldStart }) {
  const [activeTab, setActiveTab] = useState("explorer");
  const q = useLogQuery(live);
  const { services } = q;
  const spikes = services.filter((s) => s.error_rate > 15);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "r" || e.key === "R") q.runQuery?.(null);
      if (e.key === "Escape") q.setLiveKeyword("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [q]);

  return (
    <div style={{
      minHeight: "100vh", background: "#f8fafc", color: "#111827",
      fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');
        @keyframes newRow { from{background:#dcfce7} to{background:transparent} }
        @keyframes slideIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        input:focus, select:focus { border-color: #6366f1 !important; outline: none !important; box-shadow: 0 0 0 3px #e0e7ff !important; }
        .tab-btn:hover { color: #374151 !important; }
        .row-hover:hover { background: #f8fafc !important; }
        .pill-btn:hover { opacity: 0.8; }
      `}</style>

      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "12px 24px", display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#111827", letterSpacing: 0.5 }}>
            <span style={{ color: "#e8002d" }}>◈</span> Log Analytics
          </span>
          <span style={{
            fontSize: 9, padding: "3px 10px", borderRadius: 20, letterSpacing: 0.5, fontWeight: 500,
            background: live ? "#dcfce7" : "#fef9c3",
            color: live ? "#15803d" : "#854d0e",
            border: `1px solid ${live ? "#bbf7d0" : "#fde68a"}`,
          }}>{live ? "● Live" : "○ Demo mode"}</span>
          {coldStart && (
            <span style={{ fontSize: 9, color: "#92400e", padding: "3px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
              Cold start {coldStart}s
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>R = run · ESC = clear · click row to expand</span>
      </div>

      {/* Spike alert */}
      {spikes.length > 0 && (
        <div style={{
          background: "#fef2f2", borderBottom: "1px solid #fecaca",
          padding: "8px 24px", fontSize: 11, color: "#991b1b",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚠ Error spike detected:</span>
          {spikes.map((s) => (
            <span key={s.service_name} style={{
              background: "#fee2e2", border: "1px solid #fca5a5",
              borderRadius: 8, padding: "1px 8px", fontSize: 10,
            }}>{s.service_name} · {s.error_rate}%</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", display: "flex" }}>
        {TABS.map(([k, l]) => (
          <button key={k} className="tab-btn" onClick={() => setActiveTab(k)} style={{
            background: "none", border: "none",
            borderBottom: `2px solid ${activeTab === k ? "#e8002d" : "transparent"}`,
            padding: "12px 18px", cursor: "pointer", fontSize: 12, letterSpacing: 0.5,
            color: activeTab === k ? "#e8002d" : "#9ca3af",
            fontFamily: "'IBM Plex Mono', monospace", transition: "color 0.15s", fontWeight: activeTab === k ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px" }}>
        {activeTab === "explorer"  && <Explorer  q={q} />}
        {activeTab === "analytics" && <Analytics services={services} hourly={q.hourly} />}
        {activeTab === "system"    && <SystemTab live={live} coldStart={coldStart} />}
      </div>
    </div>
  );
}