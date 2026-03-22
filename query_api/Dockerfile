# Identical base setup to ingestion_api — cassandra-driver needs gcc
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libev4 \
    libev-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001


COPY secure-connect-log-analytics.zip /app/secure-connect-log-analytics.zip

# Rationale: Port 8001 keeps query API separate from ingestion (8000)
# so they can be scaled and secured independently
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]