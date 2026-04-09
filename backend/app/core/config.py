from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration sourced from environment variables.

    The stub values default to safe local development; production values are
    injected via Railway secrets or a local `.env.local` file.
    """

    # Environment & infrastructure
    env: str = "local"
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    sentry_dsn: str = ""
    log_level: str = "INFO"

    # Supabase project
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_publishable_key: str = ""

    # Supabase Auth / JWT validation
    # If supabase_jwks_url / supabase_jwt_issuer are left empty they are
    # derived from supabase_url via the computed properties below.
    supabase_jwks_url: str = ""
    supabase_jwt_issuer: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_algorithms: list[str] = ["RS256", "ES256"]
    supabase_jwt_leeway_seconds: int = 5
    supabase_jwks_cache_ttl_seconds: int = 300
    # Legacy HS256 shared secret. Only used if the Supabase project has not
    # yet migrated to asymmetric signing keys. Empty by default.
    supabase_jwt_hs_secret: str = ""

    # Session cookies
    cookie_access_name: str = "sb_access"
    cookie_refresh_name: str = "sb_refresh"
    cookie_access_max_age: int = 3600
    cookie_refresh_max_age: int = 60 * 60 * 24 * 7
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None
    cookie_path: str = "/"
    cookie_refresh_path: str = "/api/v1/auth/refresh"

    # Rate limit (login)
    auth_rate_limit_attempts: int = 5
    auth_rate_limit_window_seconds: int = 900
    auth_lockout_steps_seconds: list[int] = [900, 3600, 86400]

    # Rate limit (forgot password — stricter window, fewer tries)
    auth_forgot_rate_limit_attempts: int = 1
    auth_forgot_rate_limit_window_seconds: int = 300

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def resolved_supabase_jwks_url(self) -> str:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if not self.supabase_url:
            return ""
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def resolved_supabase_jwt_issuer(self) -> str:
        if self.supabase_jwt_issuer:
            return self.supabase_jwt_issuer
        if not self.supabase_url:
            return ""
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_auth_base_url(self) -> str:
        if not self.supabase_url:
            return ""
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


settings = Settings()
