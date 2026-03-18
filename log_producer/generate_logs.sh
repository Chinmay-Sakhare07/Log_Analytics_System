#!/usr/bin/env bash
# generate_logs.sh — Bash variant of the log producer.
# Writes JSON Lines to ./logs/<service>.log
# Usage: bash log_producer/generate_logs.sh [duration_seconds]
# Rationale: Bash producer lets you test the shipper without Python deps;
# also demonstrates the shipper works with any log source, not just Python.

set -euo pipefail

DURATION=${1:-30}
OUTPUT_DIR="./logs"
SERVICES=("auth-service" "payment-service" "api-gateway")
SEVERITIES=("INFO" "INFO" "INFO" "WARN" "WARN" "ERROR" "DEBUG")  # weighted

mkdir -p "$OUTPUT_DIR"

echo "Bash producer: running for ${DURATION}s → $OUTPUT_DIR"

END_TIME=$(( $(date +%s) + DURATION ))
COUNT=0

while [ "$(date +%s)" -lt "$END_TIME" ]; do
    # Pick random service and severity
    SVC=${SERVICES[$RANDOM % ${#SERVICES[@]}]}
    SEV=${SEVERITIES[$RANDOM % ${#SEVERITIES[@]}]}
    TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    MSG="Simulated $SEV event from $SVC at $TS"
    HOST="${SVC}-host-1"

    # Write JSON line
    printf '{"timestamp":"%s","service":"%s","severity":"%s","message":"%s","host":"%s","metadata":{"env":"local-dev"}}\n' \
        "$TS" "$SVC" "$SEV" "$MSG" "$HOST" \
        >> "$OUTPUT_DIR/${SVC}.log"

    COUNT=$((COUNT + 1))
    sleep 0.1
done

echo "Bash producer: wrote $COUNT events."