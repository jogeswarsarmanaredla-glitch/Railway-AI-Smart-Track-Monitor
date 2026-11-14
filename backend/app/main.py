"""FastAPI Application Entry Point for Railway AI – Smart Track Monitoring."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.database import engine, init_db
from app.services.simulator import simulator_service

logger = logging.getLogger("railway_ai.main")


class HealthResponse(BaseModel):
    status: str = Field(default="healthy", description="Current operational status of API")
    project: str = Field(default="Railway AI - Smart Track Monitoring")
    version: str = Field(default="0.4.0")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    environment: str = Field(..., description="Current deployment environment")
    data_source: str = Field(..., description="Indicator of live vs simulated mock data")
    active_modules: list[str] = Field(default_factory=list)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI Lifespan: Initialize DB schema, hydrate buffers, and run telemetry simulator."""
    logger.info("Initializing Railway AI backend services...")
    # 1. Initialize PostgreSQL database schema
    try:
        init_db()
    except Exception as e:
        logger.error(f"PostgreSQL connection initialization failed: {e}")
        if not settings.ALLOW_SQLITE_FALLBACK:
            raise

    # 2. Hydrate simulator buffers and start simulator
    simulator_service.init_and_hydrate()
    await simulator_service.start_background_loop()

    yield

    # Shutdown sequence
    logger.info("Shutting down Railway AI backend services...")
    await simulator_service.stop_background_loop()
    engine.dispose()
    logger.info("Backend shutdown complete.")


def create_application() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "Independent Industrial Backend for Railway AI Track Health Monitoring, "
            "vibration analysis, environmental tracking, AI fault detection, and PostgreSQL persistence."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API v1 router under /api
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["Root"])
    def root():
        """Root API summary."""
        return {
            "project": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "docs": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
            "v1_dashboard": f"{settings.API_V1_PREFIX}/v1/dashboard/summary",
            "environment": settings.ENVIRONMENT,
            "data_source": settings.DATA_SOURCE,
            "persistence": "PostgreSQL 18.6",
            "notice": "All data generated or processed during initial benchmark phases is simulated mock data.",
        }

    @app.get(
        f"{settings.API_V1_PREFIX}/health",
        response_model=HealthResponse,
        tags=["System"],
        summary="Check backend health & runtime environment",
    )
    def get_health():
        """Returns the health status, system time, and current data mode."""
        return HealthResponse(
            status="healthy",
            project=settings.PROJECT_NAME,
            version=settings.VERSION,
            timestamp=datetime.now(timezone.utc).isoformat(),
            environment=settings.ENVIRONMENT,
            data_source=settings.DATA_SOURCE,
            active_modules=[
                "core_api",
                "cors_middleware",
                "health_monitoring",
                "telemetry_simulator",
                "v1_endpoints",
                "ml_engine",
                "postgresql_database",
            ],
        )

    return app


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=True,
    )
