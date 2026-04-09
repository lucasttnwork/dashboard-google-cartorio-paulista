# workers

arq-based async worker service for the Cartório Paulista dashboard.
Consumes jobs from the shared Redis queue and exposes a `/health`
endpoint on port 9000 for container healthchecks.

## Run locally

```bash
uv pip install --system -e .[dev]
python -m app.main
```

Requires a reachable Redis (`REDIS_URL`, default `redis://localhost:6379/0`).

## Test

```bash
pytest -q
```
