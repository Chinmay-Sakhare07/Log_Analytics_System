import { useState, useEffect, useRef, useCallback } from "react";
import { fetchLogs, fetchServices, fetchStats } from "../lib/api";
import { demoCards, demoHourly, demoLogs } from "../lib/demo";
import { SEVERITIES } from "../lib/constants";

// ── Validation helpers ─────────────────────────────────────────────────────

/** Returns true if d is a real, non-NaN Date */
const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

/** Safely parse a date string — returns null on failure */
const safeDate = (str) => {
  if (!str) return null;
  const d = new Date(str);
  return isValidDate(d) ? d : null;
};

/** Clamp keyword to 200 chars, strip leading/trailing whitespace */
const sanitizeKeyword = (kw) => kw.trim().slice(0, 200);

/** Ensure at least one severity is always active */
const ensureOneSev = (set) => set.size > 0 ? set : new Set(SEVERITIES);

/**
 * Validate and resolve start/end datetimes.
 * Returns { startISO, endISO, error } where error is a string or null.
 */
const resolveDateRange = (timePreset, dateFrom, dateTo) => {
  const now = new Date();

  if (timePreset !== "custom") {
    const d = new Date();
    switch (timePreset) {
      case "1h":  d.setHours(d.getHours() - 1);  break;
      case "6h":  d.setHours(d.getHours() - 6);  break;
      case "24h": d.setDate(d.getDate() - 1);     break;
      case "7d":  d.setDate(d.getDate() - 7);     break;
      default: break;
    }
    return { startISO: d.toISOString(), endISO: now.toISOString(), error: null };
  }

  // Custom range validation
  const start = safeDate(dateFrom);
  const end   = dateTo ? safeDate(dateTo + "T23:59:59") : now;

  if (dateFrom && !start) return { startISO: null, endISO: null, error: "Invalid start date" };
  if (dateTo   && !end)   return { startISO: null, endISO: null, error: "Invalid end date" };

  if (start && start > now) {
    return { startISO: null, endISO: null, error: "Start date cannot be in the future" };
  }

  if (start && end && start >= end) {
    return { startISO: null, endISO: null, error: "Start date must be before end date" };
  }

  return {
    startISO: start ? start.toISOString() : undefined,
    endISO:   end   ? end.toISOString()   : now.toISOString(),
    error: null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

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

  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [hasNext,     setHasNext]     = useState(false);
  const [cursor,      setCursor]      = useState(null);
  const [prevStack,   setPrevStack]   = useState([]);
  const [history,     setHistory]     = useState([]);
  const [tailMode,    setTailMode]    = useState(false);

  // Validation errors shown in the UI
  const [queryError,  setQueryError]  = useState(null);

  const tailRef = useRef(null);
  const debRef  = useRef(null);

  // ── Analytics ──────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    try {
      if (live) {
        const [sv, st] = await Promise.allSettled([
          fetchServices(),
          fetchStats({ end: new Date().toISOString() }),
        ]);
        const svcList  = sv.status === "fulfilled" ? (sv.value?.services || sv.value || []) : [];
        const statList = st.status === "fulfilled" ? (st.value?.stats || (Array.isArray(st.value) ? st.value : [])) : [];
        setServices(svcList.length  ? svcList  : demoCards());
        setHourly(statList.length   ? statList : demoHourly());
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
    setQueryError(null);

    // No guard needed — if no service selected, query first available service

    // ── Guard: at least one severity must be active ───────
    const safeSevs = ensureOneSev(activeSevs);

    // ── Guard: validate + resolve date range ──────────────
    const { startISO, endISO, error: dateError } = resolveDateRange(timePreset, dateFrom, dateTo);
    if (dateError) {
      setQueryError(dateError);
      setLogs([]);
      return;
    }

    // ── Guard: sanitize keyword ───────────────────────────
    const safeKw = sanitizeKeyword(keyword);
    if (safeKw.length === 0 && keyword.length > 0) {
      // keyword was all whitespace — treat as empty
    }

    setLoading(true);
    setHistory((h) => [{
      id:   Date.now(),
      time: new Date().toLocaleTimeString(),
      svc:  selSvc || "all",
      sevs: [...safeSevs].join("+"),
      kw:   safeKw || "—",
    }, ...h.slice(0, 19)]);

    try {
      const targetSvc = selSvc || "auth-service";
      if (live) { 
        // API accepts single severity only — send first active if not all selected
        const sevParam = safeSevs.size < 4 ? [...safeSevs][0] : undefined;

        let data;
        try {
          data = await fetchLogs({
          service:    targetSvc,  // was selSvc
          severity:   sevParam,
          q:          safeKw || undefined,
          start:      startISO,
          end:        endISO,
          limit:      50,
          page_token: cur || undefined,
        });
        } catch (apiErr) {
          // API error — fall back to demo, show message
          const status = apiErr.message || "";
          if (status.includes("500")) {
            setQueryError("Server error — check your date range or try a different service");
          } else if (status.includes("401")) {
            setQueryError("API authentication failed");
          } else if (status.includes("404")) {
            setQueryError("Endpoint not found — API may have changed");
          } else {
            setQueryError("Could not reach the API — showing demo data");
          }
          setLogs(demoLogs(selSvc || null, safeSevs, safeKw));
          setHasNext(false);
          setCursor(null);
          setLoading(false);
          return;
        }

        const rows = data.results || data.logs || [];
        setLogs(rows);
        setHasNext(!!data.next_cursor);

        // Validate cursor before storing — corrupt cursor causes 500 on next page
        const nextCursor = data.next_cursor;
        if (nextCursor && typeof nextCursor === "string" && nextCursor.length > 0) {
          setCursor(nextCursor);
        } else {
          setCursor(null);
          setHasNext(false);
        }
      } else {
        setLogs(demoLogs(selSvc || null, safeSevs, safeKw));
        setHasNext(false);
        setCursor(null);
      }
    } catch (err) {
      console.error("runQuery unexpected error:", err);
      setQueryError("Unexpected error — showing demo data");
      setLogs(demoLogs(selSvc || null, safeSevs, safeKw));
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

  // ── Severity toggle — never allow empty set ────────────
  const toggleSev = useCallback((s) => {
    setActiveSevs((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        // Don't allow deselecting the last one
        if (next.size === 1) return prev;
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }, []);

  // ── Custom date setters with immediate validation ──────
  const setDateFromSafe = useCallback((val) => {
    setDateFrom(val);
    setTimePreset("custom");
    setQueryError(null);
  }, []);

  const setDateToSafe = useCallback((val) => {
    setDateTo(val);
    setTimePreset("custom");
    setQueryError(null);
  }, []);

  // ── Pagination ─────────────────────────────────────────
  const goNext = useCallback(() => {
    if (!cursor) return;
    setPrevStack((p) => [...p, cursor]);
    runQuery(cursor);
  }, [cursor, runQuery]);

  const goPrev = useCallback(() => {
    const stack = [...prevStack];
    const prev  = stack.pop();
    setPrevStack(stack);
    runQuery(prev || null);
  }, [prevStack, runQuery]);

  // ── History replay ─────────────────────────────────────
  const replayHistory = useCallback((entry) => {
    if (entry.svc !== "all") setSelSvc(entry.svc);
    if (entry.kw  !== "—")  setLiveKeyword(entry.kw);
    setQueryError(null);
    runQuery(null);
  }, [runQuery]);

  // ── CSV export ─────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!logs.length) return;
    const hdr  = "timestamp,service,severity,message,host";
    const rows = logs.map(
      (l) => `${l.timestamp},${l.service_name},${l.severity},"${(l.message || "").replace(/"/g, '""')}",${l.host || ""}`
    );
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([[hdr, ...rows].join("\n")], { type: "text/csv" }));
    a.download = `logs_${selSvc || "all"}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }, [logs, selSvc]);

  return {
    services, hourly, loadAnalytics,
    selSvc, setSelSvc,
    timePreset, setTimePreset,
    dateFrom, setDateFrom: setDateFromSafe,
    dateTo,   setDateTo:   setDateToSafe,
    activeSevs, toggleSev,
    liveKeyword, setLiveKeyword,
    keyword,
    logs, loading, hasNext, prevStack,
    goNext, goPrev,
    history, replayHistory,
    tailMode, setTailMode,
    exportCSV,
    runQuery,
    queryError,
  };
}