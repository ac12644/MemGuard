from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    memguard_env: str = "development"
    memguard_secret_key: str = "change-me-in-production"
    memguard_api_port: int = 8000

    # Database
    database_url: str = "postgresql+asyncpg://memguard:memguard@localhost:5432/memguard"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # LLM
    anthropic_api_key: str = ""
    memguard_llm_model: str = "claude-sonnet-4-20250514"
    memguard_llm_max_tokens: int = 1024
    memguard_llm_rate_limit_rpm: int = 60

    # CORS
    memguard_cors_origins: str = "*"  # Comma-separated origins, or "*" for dev

    # Validation defaults
    memguard_default_trust_threshold: float = 0.5
    memguard_quarantine_threshold: float = 0.3
    memguard_max_validation_batch: int = 100
    memguard_source_fetch_timeout: int = 10
    memguard_source_rate_limit_per_domain: int = 10

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")

    @property
    def cors_origins(self) -> list[str]:
        if self.memguard_cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.memguard_cors_origins.split(",") if o.strip()]


settings = Settings()
