# Rationale: python:3.11-slim keeps image small (~150MB vs ~900MB for full image)
# while having all build tools needed for cassandra-driver C extensions
FROM python:3.11-slim

# Prevents Python from writing .pyc files and buffers stdout immediately
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install gcc for cassandra-driver C extension compilation
# Rationale: cassandra-driver has optional C extensions that improve
# throughput by ~20%; worth the small image size increase
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libev4 \
    libev-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first so Docker layer cache skips pip install
# on subsequent builds if requirements haven't changed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

COPY secure-connect-log-analytics.zip /app/secure-connect-log-analytics.zip

# Rationale: --host 0.0.0.0 binds to all interfaces inside the container
# so Docker can forward traffic from the host machine
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]