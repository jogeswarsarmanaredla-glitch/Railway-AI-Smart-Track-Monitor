"""Dashboard summary schemas for Railway Track Health monitoring."""
from datetime import datetime
from typing import Dict, List
from pydantic import BaseModel, Field


class TrackStatusSummary(BaseModel):
    track_segment_id: str
    track_name: str
    status: str
    latest_rms: float
    latest_temp: float
    latest_speed: float
    active_alerts: int


class DashboardSummary(BaseModel):
    project: str = "Railway AI - Smart Track Monitoring"
    timestamp: datetime
    data_source: str = "SYNTHETIC_SIMULATION_ENGINE"
    is_simulated: bool = True
    overall_health_score: float = Field(..., description="Overall track network health index (0-100)")
    network_status: str = Field(..., description="NORMAL, ATTENTION, or CRITICAL")
    total_tracks_monitored: int
    healthy_tracks_count: int
    warning_tracks_count: int
    critical_tracks_count: int
    active_alerts_count: int
    system_average_vibration_rms: float
    system_average_temperature_c: float
    system_average_humidity_pct: float
    simulation_running: bool
    tracks: List[TrackStatusSummary]
