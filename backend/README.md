# cartorio-backend

FastAPI service for the Cartório Paulista dashboard. Exposes `/health` and
`/api/v1/health` endpoints; business logic lands in later phases.

## Local development

```
uv pip install -e .[dev]
uvicorn app.main:app --reload
```

## Tests

```
pytest -q
```
