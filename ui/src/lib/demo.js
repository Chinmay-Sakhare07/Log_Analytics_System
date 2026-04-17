import { SERVICES, SEVERITIES } from "./constants";

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

export const demoCards = () =>
  SERVICES.map((name) => ({
    service_name: name,
    total_events: rnd(400, 4000),
    error_count:  rnd(5, 200),
    warn_count:   rnd(20, 300),
    last_seen:    new Date(Date.now() - rnd(0, 3600000)).toISOString(),
  })).map((s) => ({
    ...s,
    error_rate: +(s.error_count / s.total_events * 100).toFixed(1),
  }));

export const demoHourly = () =>
  Array.from({ length: 24 }, (_, i) => ({
    hour:  `${String(i).padStart(2, "0")}:00`,
    ERROR: rnd(0, 40),
    WARN:  rnd(10, 80),
    INFO:  rnd(50, 300),
    DEBUG: rnd(20, 100),
  }));

const LOG_MESSAGES = {
  ERROR: ["DB connection timeout","Payment declined","Auth token expired","NullPointerException in handler","Rate limit exceeded"],
  WARN:  ["High memory usage: 87%","Retry attempt 3/5","Slow query >2s detected","Cache miss ratio high","Disk usage >80%"],
  INFO:  ["Request completed 200","Service started successfully","Config reloaded","Health check passed","Session created"],
  DEBUG: ["Entering processRequest","Query executed in 12ms","Cache hit for key user:42","Middleware chain passed","JWT validated"],
};

export const demoLogs = (svc = null, sevs = new Set(SEVERITIES), kw = "") => {
  let logs = Array.from({ length: 30 }, (_, i) => {
    const sev = SEVERITIES[rnd(0, 3)];
    const s   = svc || SERVICES[rnd(0, SERVICES.length - 1)];
    return {
      doc_id:       `demo-${i}`,
      timestamp:    new Date(Date.now() - rnd(0, 86400000)).toISOString(),
      service_name: s,
      severity:     sev,
      message:      LOG_MESSAGES[sev][rnd(0, LOG_MESSAGES[sev].length - 1)],
      host:         `${s.split("-")[0]}-${rnd(1, 3)}.prod`,
      request_id:   Math.random().toString(36).slice(2, 10),
    };
  });
  if (svc)           logs = logs.filter((l) => l.service_name === svc);
  if (sevs.size < 4) logs = logs.filter((l) => sevs.has(l.severity));
  if (kw)            logs = logs.filter((l) => l.message.toLowerCase().includes(kw.toLowerCase()));
  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};
