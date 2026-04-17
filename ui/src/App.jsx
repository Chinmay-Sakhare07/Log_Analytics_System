import { useState } from "react";
import F1Boot    from "./components/F1Boot";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [booted,    setBooted]    = useState(false);
  const [liveMode,  setLiveMode]  = useState(false);
  const [coldStart, setColdStart] = useState(null);

  const handleReady = ({ live, coldStart: cs }) => {
    setLiveMode(live);
    setColdStart(cs);
    setBooted(true);
  };

  return booted
    ? <Dashboard live={liveMode} coldStart={coldStart} />
    : <F1Boot onReady={handleReady} />;
}