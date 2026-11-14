"""API v1 Router aggregation."""
from fastapi import APIRouter
from app.api.v1.endpoints.alerts import router as alerts_router
from app.api.v1.endpoints.dashboard import router as dashboard_router
from app.api.v1.endpoints.ml import router as ml_router
from app.api.v1.endpoints.simulator import router as simulator_router
from app.api.v1.endpoints.telemetry import router as telemetry_router
from app.api.v1.endpoints.tracks import router as tracks_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(dashboard_router)
api_v1_router.include_router(tracks_router)
api_v1_router.include_router(telemetry_router)
api_v1_router.include_router(alerts_router)
api_v1_router.include_router(simulator_router)
api_v1_router.include_router(ml_router)
