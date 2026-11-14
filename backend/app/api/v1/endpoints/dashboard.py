"""Dashboard summary endpoint."""
from fastapi import APIRouter
from app.schemas.dashboard import DashboardSummary
from app.services.simulator import simulator_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary():
    """Retrieve aggregate KPI summary of all railway tracks, health score, and alerts."""
    return simulator_service.get_dashboard_summary()
