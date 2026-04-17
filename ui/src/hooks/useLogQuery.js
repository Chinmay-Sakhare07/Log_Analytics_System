import { useState, useEffect, useRef, useCallback } from "react";
import { fetchLogs, fetchServices, fetchStats } from "../lib/api";
import { demoCards, demoHourly, demoLogs } from "../lib/demo";
import { SEVERITIES } from "../lib/constants";

export function useLogQuery(live) {
  const [services,   setServices]   = useState([]);
  const [hourly,     setHourly]     = useState([]);

  const [selSvc,      setSelSvc]      = useState("");
  const [timePreset,  setTimePreset]  = useState("24h");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [activeSevs,  setActiveSevs]  = useState(new Set(SEVERITIES));
  const [liveKeyword, setLiveKeyword] = useState("");
  const [keyword,     setKeyword]     = useState("");

  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [hasNext,   setHasNext]   = useState(false);
  const [cursor,    setCursor]    = useState(null);
  const [prevStack, setPrevStack] = useState([]);
  const [history,   setHistory]   = useState([]);
  const [tailMode,  setTailMode]  = useState(false);

  const tailRef = useRef(null);
  const debRef  = useRef(null);

  // ── Helpers ────────────────────────────────────────────────
  const todayISO = () => new Date().toISOString().slice(0, 10);

  /**
   * Convert a time preset string to a start ISO datetime string.
   * The API expects full ISO8601 datetimes for start/end.
   */
  const presetToStartISO = (preset) => {
    const d = new Date();
    switch (preset) {
      case "1h":  d.setHours(d.getHours() - 1);    break;
      case "6h":  d.setHours(d.getHours() - 6);    break;
      case "24h": d.setDate(d.getDate() - 1);       break;
      case "7d":  d.setDate(d.getDate() - 7);       break;
      default:    return undefined; // "custom" — use dateFrom/dateTo directly
    }
    return d.toISOString();
  };

  // ── Analytics ──────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    try {
      if (live) {
        const [sv, st] = await Promise.allSettled([
          fetchServices(),
          fetchStats({ end: new Date().toISOString() }),
        ]);

        // /services returns { services: [...] } or just an array
        const svcList = sv.status === "fulfilled"
          ? (sv.value?.services || sv.value || [])
          : [];
        setServices(svcList.length ? svcList : demoCards());

        // /logs/stats returns an array of rows or { stats: [...] }
        const statList = st.status === "fulfilled"
          ? (st.value?.stats || (Array.isArray(st.value) ? st.value : []))
          : [];
        setHourly(statList.length ? statList : demoHourly());
      } else {
        setServices(demoCards());
        setHourly(demoHourly());
      }
    } catch {
      setServices(demoCards());
      setHourly(demoHourly());
    }
  }, [live]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // ── Search ─────────────────────────────────────────────────
  const runQuery = useCallback(async (cur = null) => {
    setLoading(true);
    setHistory((h) => [{
      id:   Date.now(),
      time: new Date().toLocaleTimeString(),
      svc:  selSvc || "all",
      sevs: [...activeSevs].join("+"),
      kw:   keyword || "—",
    }, ...h.slice(0, 19)]);

    try {
      if (live && selSvc) {
        // severity: API accepts single value only.
        // If user has all 4 active → omit (return all), else send first selected.
        const sevParam = activeSevs.size < 4 ? [...activeSevs][0] : undefined;

        // Resolve start/end to full ISO datetimes
        const startISO = dateFrom
          ? new Date(dateFrom).toISOString()
          : presetToStartISO(timePreset);
        const endISO = dateTo
          ? new Date(dateTo + "T23:59:59").toISOString()
          : new Date().toISOString();

        const data = await fetchLogs({
          service:    selSvc,
          severity:   sevParam,
          q:          keyword || undefined,
          start:      startISO,
          end:        endISO,
          limit:      50,
          page_token: cur || undefined,
        });

        // query_engine.py returns { results: [...], next_cursor: "..." }
        const rows = data.results || data.logs || [];
        setLogs(rows);
        setHasNext(!!data.next_cursor);
        setCursor(data.next_cursor || null);
      } else {
        setLogs(demoLogs(selSvc || null, activeSevs, keyword));
        setHasNext(false);
        setCursor(null);
      }
    } catch (err) {
      console.error("runQuery failed:", err);
      setLogs(demoLogs(selSvc || null, activeSevs, keyword));
      setHasNext(false);
    }

    setLoading(false);
  }, [live, selSvc, activeSevs, keyword, dateFrom, dateTo, timePreset]);

  // Re-run on filter change
  useEffect(() => {
    setPrevStack([]);
    setCursor(null);
    runQuery(null);
  }, [selSvc, activeSevs, keyword, timePreset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyword debounce
  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setKeyword(liveKeyword), 420);
  }, [liveKeyword]);

  // Tail mode
  useEffect(() => {
    if (tailMode) { tailRef.current = setInterval(() => runQuery(null), 10000); }
    else clearInterval(tailRef.current);
    return () => clearInterval(tailRef.current);
  }, [tailMode, runQuery]);

  const goNext = useCallback(() => {
    setPrevStack((p) => [...p, cursor]);
    runQuery(cursor);
  }, [cursor, runQuery]);

  const goPrev = useCallback(() => {
    const stack = [...prevStack];
    const prev  = stack.pop();
    setPrevStack(stack);
    runQuery(prev || null);
  }, [prevStack, runQuery]);

  const toggleSev = useCallback((s) => {
    setActiveSevs((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);

  const replayHistory = useCallback((entry) => {
    if (entry.svc !== "all") setSelSvc(entry.svc);
    if (entry.kw  !== "—")  setLiveKeyword(entry.kw);
    runQuery(null);
  }, [runQuery]);

  const exportCSV = useCallback(() => {
    const hdr  = "timestamp,service,severity,message,host";
    const rows = logs.map(
      (l) => `${l.timestamp},${l.service_name},${l.severity},"${l.message}",${l.host || ""}`
    );
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([[hdr, ...rows].join("\n")], { type: "text/csv" }));
    a.download = "logs_export.csv";
    a.click();
  }, [logs]);

  return {
    services, hourly, loadAnalytics,
    selSvc, setSelSvc,
    timePreset, setTimePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    activeSevs, toggleSev,
    liveKeyword, setLiveKeyword,
    keyword,
    logs, loading, hasNext, prevStack,
    goNext, goPrev,
    history, replayHistory,
    tailMode, setTailMode,
    exportCSV,
    runQuery,
  };
}