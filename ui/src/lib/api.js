import { INGESTION_API, QUERY_API, API_KEY } from "./constants";

export async function apiFetch(base, path, params = {}, method = "GET") {
  const url = new URL(base + path);

  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url, {
    method,
    headers: { "X-API-Key": API_KEY },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const checkIngestionHealth = () => apiFetch(INGESTION_API, "/health");
export const checkQueryHealth     = () => apiFetch(QUERY_API,     "/health");

// ─── Query API ────────────────────────────────────────────────────────────────
export const fetchServices = () =>
  apiFetch(QUERY_API, "/services");

export const fetchStats = ({ service, start, end } = {}) =>
  apiFetch(QUERY_API, "/logs/stats", { service, start, end });

export const fetchLogs = ({ service, severity, q, start, end, limit = 50, page_token } = {}) =>
  apiFetch(QUERY_API, "/logs/search", { service, severity, q, start, end, limit, page_token });

// ─── Demo ─────────────────────────────────────────────────────────────────────
export const generateDemoLogs = (count = 20) =>
  apiFetch(INGESTION_API, `/demo/generate?count=${count}`, {}, "POST");