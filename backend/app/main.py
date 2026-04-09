from __future__ import annotations

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import health
from .core.config import settings
from .core.logging import configure_logging

configure_logging(settings.log_level)

logger = structlog.get_logger(__name__)

app = FastAPI(title="Cartorio Dashboard Backend", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])


@app.on_event("startup")
async def on_startup() -> None:
    logger.info(
        "backend.startup",
        env=settings.env,
        version=app.version,
    )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    logger.info("backend.shutdown", version=app.version)


@app.get("/health")
async def root_health() -> dict[str, str]:
    return {"status": "ok", "service": "backend", "version": app.version}
