from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the arq workers service.

    Values are read from environment variables, with an optional
    ``.env.local`` file loaded for local development. Unknown keys are
    ignored so the same file can be shared across services.
    """

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    redis_url: str = "redis://localhost:6379/0"
    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    sentry_dsn: str = ""
    log_level: str = "INFO"
    health_port: int = 9000

    # Phase 4: Collection & NLP
    apify_token: str = ""
    openrouter_api_key: str = ""
    collection_enabled: bool = True
    collection_window_hours: int = 3
    nlp_confidence_threshold: float = 0.7
    nlp_batch_size: int = 10
    google_place_url: str = ""
    location_id: str = "cartorio-paulista-location"


settings = Settings()
