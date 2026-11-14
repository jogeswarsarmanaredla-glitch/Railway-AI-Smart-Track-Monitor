"""SQLAlchemy 2.0 Database Engine, Session, and Base declarative models."""
from datetime import datetime, timezone
import logging
from typing import Generator
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger("railway_ai.database")


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 Declarative Base class."""
    pass


def get_sanitized_url(url: str) -> str:
    """Return a database URL with the password redacted for safe logging."""
    try:
        parsed = urlparse(url)
        if parsed.password:
            sanitized = url.replace(f":{parsed.password}@", ":***@")
            return sanitized
        return url
    except Exception:
        return "postgresql://***"


def create_db_engine(db_url: str):
    """Instantiate a robust SQLAlchemy 2.0 engine."""
    connect_args = {}
    # SQLite compatibility for isolated unit tests if requested
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        return create_engine(db_url, connect_args=connect_args)

    return create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
    )


# Primary application engine and session maker
engine = create_db_engine(settings.sqlalchemy_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for thread-safe database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(target_engine=None) -> None:
    """Initialize database tables and verify connectivity."""
    curr_engine = target_engine or engine
    sanitized_url = get_sanitized_url(str(curr_engine.url))
    logger.info(f"Connecting to database: {sanitized_url}")

    try:
        # Import all models to ensure they are registered with Base.metadata
        import app.models  # noqa: F401

        Base.metadata.create_all(bind=curr_engine)

        # Ensure non-destructive schema evolution for Phase 5 columns if table already existed
        if not str(curr_engine.url).startswith("sqlite"):
            with curr_engine.begin() as conn:
                conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;"))
                conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(100);"))
                conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;"))
                conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100);"))

        logger.info("Database schema initialized and verified successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database schema: {e}")
        raise
