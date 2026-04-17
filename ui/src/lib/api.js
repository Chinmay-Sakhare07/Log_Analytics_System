import { INGESTION_API, QUERY_API, API_KEY } from "./constants";

/**
 * Base fetch wrapper. Throws on non-2xx or timeout.
 * @param {string} base  - API base URL
 * @param {string} path  - endpoint path
 * @param {object} params - query params (undefined/null values are skipped)
 */
export async function apiFetch(base, path, params = {}) {
  const url = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") url.searchParams.set(k, v);
  });

  const res = await fetch(url, {
    headers: { "X-API-Key": API_KEY },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const checkIngestionHealth = () => apiFetch(INGESTION_API, "/health");
export const checkQueryHealth     = () => apiFetch(QUERY_API,     "/health");

// ─── Query API ────────────────────────────────────────────────────────────────
// NOTE: actual endpoints are /logs/search, /logs/stats, /services

export const fetchServices = () =>
  apiFetch(QUERY_API, "/services");

export const fetchStats = ({ service, start, end } = {}) =>
  apiFetch(QUERY_API, "/logs/stats", { service, start, end });

/**
 * @param {object} opts
 * @param {string}  opts.service    - required
 * @param {string}  [opts.severity] - single severity (API only supports one at a time)
 * @param {string}  [opts.q]        - keyword search
 * @param {string}  [opts.start]    - ISO datetime
 * @param {string}  [opts.end]      - ISO datetime
 * @param {number}  [opts.limit]    - default 50
 * @param {string}  [opts.page_token] - pagination cursor
 */
export const fetchLogs = ({ service, severity, q, start, end, limit = 50, page_token } = {}) =>
  apiFetch(QUERY_API, "/logs/search", { service, severity, q, start, end, limit, page_token });