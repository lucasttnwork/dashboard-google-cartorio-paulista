FROM python:3.12-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system -e .
COPY . .
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:9000/health || exit 1
# Single entry point runs both the aiohttp health server and the arq
# worker in the same event loop. See workers/app/main.py.
CMD ["python", "-m", "app.main"]
