FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Decode the base64-injected secure bundle at startup, then launch
CMD ["/bin/sh", "-c", "echo \"$ASTRA_SECURE_BUNDLE\" | base64 -d > /app/secure-connect-bundle.zip && uvicorn app:app --host 0.0.0.0 --port 8000"]