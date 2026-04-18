import { useState, useEffect } from "react";
import { useLogQuery }        from "../hooks/useLogQuery";
import Explorer               from "./tabs/Explorer";
import Analytics              from "./tabs/Analytics";
import SystemTab              from "./tabs/SystemTab";
import LogGeneratorPanel      from "./LogGeneratorPanel";
import ThemePopup             from "./ThemePopup";

const TABS = [
  ["explorer",  "Explorer"],
  ["analytics", "Analytics"],
  ["system",    "System"],
];

const THEME = {
  light: {
    pageBg:     "#f5f4f0",
    cardBg:     "#ffffff",
    border:     "#e8e4dc",
    text:       "#1a1a1a",
    muted:      "#8a8580",
    topBar:     "#ffffff",
    tabBar:     "#ffffff",
    inputBg:    "#ffffff",
    inputBorder:"#d1d5db",
    hoverBg:    "#f5f4f0",
    scrollTrack:"#f1f5f9",
    scrollThumb:"#cbd5e1",
  },
  dark: {
    pageBg:     "#0d0d0d",
    cardBg:     "#161616",
    border:     "#2a2a2a",
    text:       "#f0ede8",
    muted:      "#555550",
    topBar:     "#111111",
    tabBar:     "#111111",
    inputBg:    "#1e1e1e",
    inputBorder:"#333333",
    hoverBg:    "#1e1e1e",
    scrollTrack:"#161616",
    scrollThumb:"#2a2a2a",
  },
};

export default function Dashboard({ live, coldStart }) {
  const [activeTab,      setActiveTab]      = useState("explorer");
  const [theme,          setTheme]          = useState("light");
  const [showThemePopup, setShowThemePopup] = useState(false);
  const [showGenerator,  setShowGenerator]  = useState(false);

  const q = useLogQuery(live);
  const { services } = q;
  const spikes = services.filter((s) => s.error_rate > 15);
  const t = THEME[theme];
  const dk = theme === "dark";

  // Show theme popup on first visit
  useEffect(() => {
    const saved = localStorage.getItem("log-analytics-theme");
    if (saved) {
      setTheme(saved);
    } else {
      setShowThemePopup(true);
    }
  }, []);

  const chooseTheme = (choice) => {
    setTheme(choice);
    localStorage.setItem("log-analytics-theme", choice);
    setShowThemePopup(false);
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("log-analytics-theme", next);
  };

  // Keyboard shortcuts
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
      minHeight: "100vh",
      background: t.pageBg,
      color: t.text,
      fontFamily: "'IBM Plex Mono', monospace",
      boxSizing: "border-box",
      transition: "background 0.2s, color 0.2s",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');
        @keyframes newRow  { from{background:#dcfce7} to{background:transparent} }
        @keyframes slideIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${t.scrollTrack}; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 3px; }
        input:focus, select:focus { border-color: #6366f1 !important; outline: none !important; box-shadow: 0 0 0 3px ${dk ? "#312e81" : "#e0e7ff"} !important; }
        .tab-btn:hover  { color: ${t.text} !important; }
        .row-hover:hover { background: ${t.hoverBg} !important; }
        .pill-btn:hover { opacity: 0.8; }
        .icon-btn:hover { background: ${dk ? "#2a2a2a" : "#f3f4f6"} !important; }
      `}</style>

      {/* Theme popup */}
      {showThemePopup && <ThemePopup onChoose={chooseTheme} />}

      {/* Log generator panel */}
      {showGenerator && (
        <LogGeneratorPanel
          theme={theme}
          onClose={() => setShowGenerator(false)}
          onLogsGenerated={() => q.runQuery?.(null)}
        />
      )}

      {/* Top bar */}
      <div style={{
        background: t.topBar,
        borderBottom: `1px solid ${t.border}`,
        padding: "12px 24px",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 8,
        boxShadow: dk ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: t.text, letterSpacing: 0.5 }}>
            <span style={{ color: "#e8002d" }}>◈</span> Log Analytics
          </span>
          <span style={{
            fontSize: 9, padding: "3px 10px", borderRadius: 20,
            letterSpacing: 0.5, fontWeight: 500,
            background: live ? "#dcfce7" : dk ? "#2a2a1a" : "#fef9c3",
            color:      live ? "#15803d" : "#854d0e",
            border: `1px solid ${live ? "#bbf7d0" : "#fde68a"}`,
          }}>{live ? "● Live" : "○ Demo mode"}</span>
          {coldStart && (
            <span style={{
              fontSize: 9, color: "#92400e", padding: "3px 8px",
              background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
            }}>Cold start {coldStart}s</span>
          )}
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: t.muted, marginRight: 4 }}>
            R = run · ESC = clear
          </span>

          {/* Generate button */}
          <button
            onClick={() => setShowGenerator((v) => !v)}
            className="icon-btn"
            style={{
              background: showGenerator ? "#e8002d" : "none",
              border: `1px solid ${showGenerator ? "#e8002d" : t.border}`,
              borderRadius: 8, padding: "6px 12px",
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              color: showGenerator ? "#fff" : t.muted,
              fontFamily: "'IBM Plex Mono', monospace",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.15s",
            }}
          >
            <span>⚡</span>
            <span>Generate</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="icon-btn"
            title={`Switch to ${dk ? "light" : "dark"} mode`}
            style={{
              background: "none",
              border: `1px solid ${t.border}`,
              borderRadius: 8, padding: "6px 10px",
              cursor: "pointer", fontSize: 14,
              color: t.muted,
              transition: "all 0.15s",
            }}
          >
            {dk ? "☀" : "◑"}
          </button>
        </div>
      </div>

      {/* Spike alert */}
      {spikes.length > 0 && (
        <div style={{
          background: dk ? "#200d0d" : "#fef2f2",
          borderBottom: `1px solid ${dk ? "#4a1a1a" : "#fecaca"}`,
          padding: "8px 24px", fontSize: 11,
          color: "#991b1b",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚠ Error spike detected:</span>
          {spikes.map((s) => (
            <span key={s.service_name} style={{
              background: dk ? "#2a1010" : "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: 8, padding: "1px 8px", fontSize: 10,
            }}>{s.service_name} · {s.error_rate}%</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        background: t.tabBar,
        borderBottom: `1px solid ${t.border}`,
        padding: "0 24px", display: "flex",
      }}>
        {TABS.map(([k, l]) => (
          <button key={k} className="tab-btn" onClick={() => setActiveTab(k)} style={{
            background: "none", border: "none",
            borderBottom: `2px solid ${activeTab === k ? "#e8002d" : "transparent"}`,
            padding: "12px 18px", cursor: "pointer",
            fontSize: 12, letterSpacing: 0.5,
            color: activeTab === k ? "#e8002d" : t.muted,
            fontFamily: "'IBM Plex Mono', monospace",
            transition: "color 0.15s",
            fontWeight: activeTab === k ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px" }}>
        {activeTab === "explorer"  && <Explorer  q={q} theme={theme} t={t} />}
        {activeTab === "analytics" && <Analytics services={services} hourly={q.hourly} theme={theme} t={t} />}
        {activeTab === "system"    && (
          <SystemTab
            live={live}
            coldStart={coldStart}
            theme={theme}
            t={t}
            onOpenGenerator={() => setShowGenerator(true)}
          />
        )}
      </div>
    </div>
  );
}