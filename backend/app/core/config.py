from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration sourced from environment variables.

    The stub values default to safe local development; production values are
    injected via Railway secrets or a local `.env.local` file.
    """

    env: str = "local"
    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    sentry_dsn: str = ""
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
