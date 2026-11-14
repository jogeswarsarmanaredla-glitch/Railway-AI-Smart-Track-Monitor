"""Application configuration using Pydantic."""
import os
from typing import List, Optional
from urllib.parse import quote_plus


class BaseConfigMixin:
    PROJECT_NAME: str = "Railway AI - Smart Track Monitoring"
    VERSION: str = "0.4.0"
    API_V1_PREFIX: str = "/api"
    ENVIRONMENT: str = "development"
    DATA_SOURCE: str = "SIMULATED_MOCK_ENGINE"
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"

    # PostgreSQL 18.6 Database Settings
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "railway_ai"
    DATABASE_URL: Optional[str] = None
    ALLOW_SQLITE_FALLBACK: bool = False

    # Sampling continuity guard settings
    MAX_SAMPLE_GAP_SECONDS: Optional[float] = None

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        """Construct the SQLAlchemy connection URI with the psycopg driver."""
        if self.DATABASE_URL:
            # Normalize scheme if standard postgresql:// is provided
            if self.DATABASE_URL.startswith("postgresql://"):
                return self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
            return self.DATABASE_URL

        # Construct URI from individual components
        user = quote_plus(self.POSTGRES_USER) if self.POSTGRES_USER else ""
        if self.POSTGRES_PASSWORD:
            password = quote_plus(self.POSTGRES_PASSWORD)
            auth = f"{user}:{password}" if user else f":{password}"
        else:
            auth = user

        auth_part = f"{auth}@" if auth else ""
        return f"postgresql+psycopg://{auth_part}{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"


try:
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings, BaseConfigMixin):
        class Config:
            env_file = ".env"
            case_sensitive = True
            extra = "allow"

except ImportError:
    from pydantic import BaseModel

    class Settings(BaseModel, BaseConfigMixin):  # type: ignore[no-redef]
        PROJECT_NAME: str = "Railway AI - Smart Track Monitoring"
        VERSION: str = "0.4.0"
        API_V1_PREFIX: str = "/api"
        ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
        DATA_SOURCE: str = os.getenv("DATA_SOURCE", "SIMULATED_MOCK_ENGINE")
        BACKEND_HOST: str = os.getenv("BACKEND_HOST", "127.0.0.1")
        BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
        ALLOWED_ORIGINS: str = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
        )
        POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
        POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "")
        POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "127.0.0.1")
        POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))
        POSTGRES_DB: str = os.getenv("POSTGRES_DB", "railway_ai")
        DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL", None)
        ALLOW_SQLITE_FALLBACK: bool = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true"
        MAX_SAMPLE_GAP_SECONDS: Optional[float] = (
            float(os.getenv("MAX_SAMPLE_GAP_SECONDS")) if os.getenv("MAX_SAMPLE_GAP_SECONDS") else None
        )


settings = Settings()
