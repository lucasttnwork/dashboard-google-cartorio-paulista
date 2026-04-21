FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System packages: curl for healthcheck + build essentials as a safety net
# for any native wheel that lacks a pre-built manylinux binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir uv

# Copy the full project before installing. Editable install via setuptools
# requires the package directory (app/) to be present on disk; copying only
# pyproject.toml first would fail at build time with "no packages found".
# .dockerignore keeps this copy lean (no .venv, no __pycache__, no .env).
COPY . .

RUN uv pip install --system -e .

EXPOSE 8000

# start-period gives uvicorn time to finish imports before the first probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "::", "--port", "8000"]
