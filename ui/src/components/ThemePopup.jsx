export default function ThemePopup({ onChoose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace",
      animation: "fadeIn 0.2s ease",
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
      <div style={{
        background: "#ffffff",
        borderRadius: "16px 16px 0 0",
        padding: "32px 32px 40px",
        width: "100%", maxWidth: 520,
        animation: "slideUp 0.25s ease",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: 11, color: "#8a8580", letterSpacing: 2, marginBottom: 8 }}>APPEARANCE</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
          Choose your theme
        </div>
        <div style={{ fontSize: 12, color: "#8a8580", marginBottom: 28 }}>
          You can change this anytime from the header.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Light */}
          <button onClick={() => onChoose("light")} style={{
            background: "#f5f4f0",
            border: "2px solid #e8e4dc",
            borderRadius: 12, padding: "24px 16px",
            cursor: "pointer", textAlign: "center",
            transition: "border-color 0.15s",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8002d"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e8e4dc"}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>☀</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Light</div>
            <div style={{ fontSize: 10, color: "#8a8580" }}>Clean & minimal</div>
            {/* Preview */}
            <div style={{
              marginTop: 14, background: "#ffffff",
              border: "1px solid #e8e4dc", borderRadius: 6,
              padding: "8px", display: "flex", flexDirection: "column", gap: 4,
            }}>
              {["#e5e7eb", "#d1d5db", "#e5e7eb"].map((c, i) => (
                <div key={i} style={{ height: 6, borderRadius: 3, background: c, width: i === 1 ? "60%" : "100%" }} />
              ))}
            </div>
          </button>

          {/* Dark */}
          <button onClick={() => onChoose("dark")} style={{
            background: "#0d0d0d",
            border: "2px solid #2a2a2a",
            borderRadius: 12, padding: "24px 16px",
            cursor: "pointer", textAlign: "center",
            transition: "border-color 0.15s",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8002d"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2a2a2a"}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>◑</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f0ede8", marginBottom: 4 }}>Dark</div>
            <div style={{ fontSize: 10, color: "#555550" }}>Easy on the eyes</div>
            {/* Preview */}
            <div style={{
              marginTop: 14, background: "#161616",
              border: "1px solid #2a2a2a", borderRadius: 6,
              padding: "8px", display: "flex", flexDirection: "column", gap: 4,
            }}>
              {["#2a2a2a", "#333333", "#2a2a2a"].map((c, i) => (
                <div key={i} style={{ height: 6, borderRadius: 3, background: c, width: i === 1 ? "60%" : "100%" }} />
              ))}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}