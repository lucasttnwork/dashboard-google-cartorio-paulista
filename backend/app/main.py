from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker

from .api.v1 import auth, health
from .core.config import settings
from .core.logging import configure_logging
from .core.observability import RequestIdMiddleware, init_sentry
from .core.security import warm_jwks_cache
from .db.session import get_engine
from .services.rate_limit import RateLimiter
from .services.supabase_auth import SupabaseAuthClient

configure_logging(settings.log_level)

# Initialize Sentry BEFORE creating the FastAPI app so startup errors are
# captured. init_sentry is a no-op when the DSN is unset.
init_sentry(dsn=settings.sentry_dsn, env=settings.env, release="0.0.1")

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Wires runtime singletons onto ``app.state`` for the Phase 1 auth
    stack:

    - ``http``                — a reused ``httpx.AsyncClient``
    - ``supabase_auth``       — the gotrue relay, if Supabase is configured
    - ``redis``               — async Redis client from ``settings.redis_url``
    - ``rate_limiter``        — RateLimiter over that Redis client
    - ``db_engine``           — SQLAlchemy async engine (if DATABASE_URL set)
    - ``db_sessionmaker``     — async_sessionmaker bound to the engine

    Each piece is optional in the sense that, if its prerequisites are
    missing, the accessor dependency returns HTTP 503 rather than
    crashing startup. This keeps local scaffolding usable without a full
    Supabase + Postgres environment.
    """
    logger.info("backend.startup", env=settings.env, version=app.version)

    # --- httpx client (shared across services) --------------------------
    app.state.http = httpx.AsyncClient(timeout=30.0)

    # --- Supabase Auth relay -------------------------------------------
    if settings.supabase_url and settings.supabase_service_role_key:
        app.state.supabase_auth = SupabaseAuthClient(
            base_url=settings.supabase_auth_base_url,
            secret_key=settings.supabase_service_role_key,
            http=app.state.http,
        )
        logger.info("backend.supabase_auth_ready")
    else:
        app.state.supabase_auth = None
        logger.warning(
            "backend.supabase_auth_skipped",
            reason="missing_supabase_url_or_secret_key",
        )

    # --- Redis + rate limiter ------------------------------------------
    try:
        app.state.redis = Redis.from_url(settings.redis_url, decode_responses=False)
        await app.state.redis.ping()
        app.state.rate_limiter = RateLimiter(app.state.redis)
        logger.info("backend.redis_ready", url=settings.redis_url)
    except Exception as exc:  # noqa: BLE001
        app.state.redis = None
        app.state.rate_limiter = None
        logger.warning("backend.redis_skipped", error=str(exc))

    # --- Database engine + sessionmaker --------------------------------
    engine = get_engine()
    if engine is not None:
        app.state.db_engine = engine
        app.state.db_sessionmaker = async_sessionmaker(
            engine, expire_on_commit=False
        )
        logger.info("backend.db_ready")
    else:
        app.state.db_engine = None
        app.state.db_sessionmaker = None
        logger.info("backend.db_skipped", reason="no_database_url")

    # --- Warm JWKS cache (best-effort, swallows errors) ----------------
    await warm_jwks_cache()

    try:
        yield
    finally:
        logger.info("backend.shutdown", version=app.version)
        if app.state.redis is not None:
            try:
                await app.state.redis.aclose()
            except Exception as exc:  # noqa: BLE001
                logger.warning("backend.redis_close_failed", error=str(exc))
        if app.state.db_engine is not None:
            try:
                await app.state.db_engine.dispose()
            except Exception as exc:  # noqa: BLE001
                logger.warning("backend.db_dispose_failed", error=str(exc))
        try:
            await app.state.http.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("backend.http_close_failed", error=str(exc))


app = FastAPI(
    title="Cartorio Dashboard Backend",
    version="0.0.1",
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1/auth")
if settings.env != "production":
    app.include_router(auth.debug_router, prefix="/api/v1")


@app.get("/health")
async def root_health() -> dict[str, str]:
    """Unversioned root health endpoint for container orchestration probes."""
    return {"status": "ok", "service": "backend", "version": app.version}
