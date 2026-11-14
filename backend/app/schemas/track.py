"""Schemas for Track Segments and Track Analytics."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class TrackSegmentSchema(BaseModel):
    id: str = Field(..., description="Segment ID e.g. TRK-01")
    code: str
    name: str
    line_type: str
    base_speed_kmh: float
    nominal_temperature_c: float
    nominal_humidity_pct: float
    health_status: str
    is_simulated: bool = True
    data_source: str = "POSTGRESQL_PERSISTENT_STORAGE"


class TrackAnalyticsResponse(BaseModel):
    track_id: str
    track_name: str
    line_type: str
    base_speed_kmh: float
    nominal_temperature_c: float
    nominal_humidity_pct: float
    health_status: str
    total_telemetry_records: int
    vibration_rms: Dict[str, float] = Field(..., description="mean, min, max, latest in g")
    vibration_z: Dict[str, float] = Field(..., description="mean, max, latest vertical acceleration in g")
    temperature_c: Dict[str, float] = Field(..., description="mean, min, max, latest rail surface temp in °C")
    humidity_pct: Dict[str, float] = Field(..., description="mean, latest relative humidity %")
    speed_kmh: Dict[str, float] = Field(..., description="mean, max, latest transit speed in km/h")
    alerts_summary: Dict[str, int] = Field(..., description="total, active, acknowledged, resolved alert counts")
    latest_prediction: Optional[Dict[str, Any]] = None
    data_source: str = "POSTGRESQL_PERSISTENT_STORAGE"
    is_simulated: bool = True
