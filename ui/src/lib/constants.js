export const INGESTION_API = "https://log-analytics-ingestion.fly.dev";
export const QUERY_API     = "https://log-analytics-query.fly.dev";
export const API_KEY       = "log-analytics-secret-2026";

export const MAX_ATTEMPTS  = 5;
export const POLL_INTERVAL = 7000;

export const SERVICES = [
  "auth-service",
  "payment-service",
  "api-gateway",
  "notification-service",
  "user-service",
  "report-service",
];

export const SEVERITIES = ["ERROR", "WARN", "INFO", "DEBUG"];

export const SEV_COLOR = {
  ERROR: "#d92b2b",
  WARN:  "#d97706",
  INFO:  "#2563eb",
  DEBUG: "#6b7280",
};

export const SEV_BG = {
  ERROR: "#fef2f2",
  WARN:  "#fffbeb",
  INFO:  "#eff6ff",
  DEBUG: "#f9fafb",
};

export const TIME_PRESETS = ["1h", "6h", "24h", "7d"];