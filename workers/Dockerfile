FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir uv

# Copy full project before editable install (see backend/Dockerfile for the
# rationale — setuptools cannot find packages that are not yet on disk).
COPY . .

RUN uv pip install --system -e .

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:9000/health || exit 1

# Single entry point runs both the aiohttp health server and the arq worker
# in the same asyncio event loop. See workers/app/main.py.
CMD ["python", "-m", "app.main"]
