import { useState, useEffect, useRef, useCallback } from "react";
import { checkIngestionHealth, checkQueryHealth } from "../lib/api";
import { MAX_ATTEMPTS, POLL_INTERVAL } from "../lib/constants";

/**
 * Light states per bulb: "off" | "red" | "green" | "dark"
 *
 * Phases:
 *   waiting  — before first attempt
 *   racing   — attempts firing
 *   go_seq   — both OK, playing green light-up sequence (200ms per light)
 *   go       — all green, holding 1s before redirect
 *   fail_seq — exhausted, playing red-all-then-dark sequence
 *   fail     — all dark, holding before redirect
 */
export function useBootSequence(onReady) {
  const [attempt,   setAttempt]   = useState(0);
  const [phase,     setPhase]     = useState("waiting");
  const [lights,    setLights]    = useState(["off","off","off","off","off"]);
  const [countdown, setCountdown] = useState(null);
  const [termLogs,  setTermLogs]  = useState([]);
  const [apiState,  setApiState]  = useState({
    ingestion: { status: "idle", ms: null, cold: null },
    query:     { status: "idle", ms: null, cold: null },
  });

  const countdownRef = useRef(null);
  const onReadyRef   = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const addLog = useCallback((msg, type = "default") => {
    setTermLogs((p) => [
      ...p.slice(-10),
      { id: Date.now() + Math.random(), t: new Date().toLocaleTimeString(), msg, type },
    ]);
  }, []);

  const patchApi = useCallback((key, patch) => {
    setApiState((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  }, []);

  // ── Green sequence: light up one by one, 200ms apart ─────────────────────
  const playGreenSequence = useCallback((coldStart) => {
    setPhase("go_seq");
    addLog("Lights out — GO!", "go");

    // Light up each bulb green, 200ms apart
    [0,1,2,3,4].forEach((i) => {
      setTimeout(() => {
        setLights((prev) => {
          const next = [...prev];
          next[i] = "green";
          return next;
        });
      }, i * 200);
    });

    // After all 5 are green (5 * 200 = 1000ms), hold for 1s, then redirect
    setTimeout(() => {
      setPhase("go");
      setTimeout(() => {
        onReadyRef.current({ live: true, coldStart });
      }, 1000);
    }, 5 * 200 + 800);
  }, [addLog]);

  // ── Fail sequence: all flash red → go dark right-to-left ─────────────────
  const playFailSequence = useCallback(() => {
    setPhase("fail_seq");
    addLog("All attempts exhausted — loading historical data.", "warn");

    // All 5 flash red simultaneously for 600ms
    setLights(["red","red","red","red","red"]);

    // Then go dark right to left, 150ms apart
    setTimeout(() => {
      [4,3,2,1,0].forEach((i) => {
        setTimeout(() => {
          setLights((prev) => {
            const next = [...prev];
            next[i] = "dark";
            return next;
          });
        }, (4 - i) * 150);
      });

      // After all dark (5 * 150 = 750ms), hold 800ms then redirect
      setTimeout(() => {
        setPhase("fail");
        setTimeout(() => {
          onReadyRef.current({ live: false, coldStart: null });
        }, 800);
      }, 5 * 150 + 800);
    }, 600);
  }, [addLog]);

  // ── Main attempt loop ─────────────────────────────────────────────────────
  const doAttempt = useCallback(async (n) => {
    clearInterval(countdownRef.current);
    setCountdown(null);
    setAttempt(n);

    // Light up the nth bulb red (1-indexed → index n-1)
    setLights((prev) => {
      const next = [...prev];
      next[n - 1] = "red";
      return next;
    });

    patchApi("ingestion", { status: "checking", ms: null });
    patchApi("query",     { status: "checking", ms: null });
    addLog(`Attempt ${n}/${MAX_ATTEMPTS} — pinging both APIs…`);

    const t0 = Date.now();
    const [ing, qry] = await Promise.allSettled([
      checkIngestionHealth(),
      checkQueryHealth(),
    ]);
    const elapsed = Date.now() - t0;

    const ingOk = ing.status === "fulfilled";
    const qryOk = qry.status === "fulfilled";

    patchApi("ingestion", {
      status: ingOk ? "ok" : "fail",
      ms:     ingOk ? elapsed : null,
      cold:   ingOk && elapsed > 4000 ? `cold start ${(elapsed / 1000).toFixed(1)}s` : null,
    });
    patchApi("query", {
      status: qryOk ? "ok" : "fail",
      ms:     qryOk ? elapsed : null,
      cold:   qryOk && elapsed > 4000 ? `cold start ${(elapsed / 1000).toFixed(1)}s` : null,
    });

    addLog(`Ingestion → ${ingOk ? `200 OK (${elapsed}ms)` : "failed"}`, ingOk ? "ok" : "err");
    addLog(`Query     → ${qryOk ? `200 OK (${elapsed}ms)` : "failed"}`, qryOk ? "ok" : "err");

    if (ingOk && qryOk) {
      const coldStart = elapsed > 4000 ? (elapsed / 1000).toFixed(1) : null;
      playGreenSequence(coldStart);
      return;
    }

    if (n >= MAX_ATTEMPTS) {
      playFailSequence();
      return;
    }

    addLog(`Retrying in ${POLL_INTERVAL / 1000}s…`);
    let c = POLL_INTERVAL / 1000;
    setCountdown(c);
    countdownRef.current = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) { clearInterval(countdownRef.current); doAttempt(n + 1); }
    }, 1000);
  }, [addLog, patchApi, playGreenSequence, playFailSequence]);

  useEffect(() => {
    const t = setTimeout(() => { setPhase("racing"); doAttempt(1); }, 600);
    return () => { clearTimeout(t); clearInterval(countdownRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { attempt, lights, phase, countdown, termLogs, apiState };
}