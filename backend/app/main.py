from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import health
from .core.config import settings
from .core.logging import configure_logging

configure_logging(settings.log_level)

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Replaces the deprecated ``@app.on_event("startup"/"shutdown")`` hooks.
    Keeps startup/shutdown structured log lines for Sentry + Railway Logs.
    Future phases will attach DB pools, httpx clients, and Sentry here.
    """
    logger.info("backend.startup", env=settings.env, version=app.version)
    try:
        yield
    finally:
        logger.info("backend.shutdown", version=app.version)


app = FastAPI(
    title="Cartorio Dashboard Backend",
    version="0.0.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")


@app.get("/health")
async def root_health() -> dict[str, str]:
    """Unversioned root health endpoint for container orchestration probes."""
    return {"status": "ok", "service": "backend", "version": app.version}
