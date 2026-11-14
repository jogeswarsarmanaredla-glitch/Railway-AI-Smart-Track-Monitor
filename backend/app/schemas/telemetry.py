"""Telemetry schemas for Railway AI sensor readings."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TelemetryReading(BaseModel):
    id: str = Field(..., description="Unique reading identifier")
    track_segment_id: str = Field(..., description="Track segment code (e.g. TRK-01)")
    track_name: str = Field(..., description="Human-readable track segment name")
    timestamp: datetime = Field(..., description="Reading timestamp in UTC")
    vibration_x: float = Field(..., description="Lateral acceleration in g (perpendicular to rail)")
    vibration_y: float = Field(..., description="Longitudinal acceleration in g (along travel)")
    vibration_z: float = Field(..., description="Vertical acceleration in g (impact on rail)")
    vibration_rms: float = Field(..., description="Vector magnitude Root Mean Square in g")
    temperature_c: float = Field(..., description="Rail surface temperature in Celsius")
    humidity_pct: float = Field(..., description="Ambient relative humidity percentage")
    train_speed_kmh: float = Field(..., description="Train transit speed in km/h")
    status: str = Field(default="NORMAL", description="Threshold status: NORMAL, WARNING, CRITICAL")
    simulation_profile: str = Field(default="nominal", description="Simulation scenario active")
    is_simulated: bool = Field(default=True, description="Strict synthetic data flag")
    data_source: str = Field(default="SYNTHETIC_SIMULATION_ENGINE", description="Data provenance label")


class TelemetryHistoryResponse(BaseModel):
    track_segment_id: Optional[str] = None
    total_records: int
    data_source: str = "SYNTHETIC_SIMULATION_ENGINE"
    is_simulated: bool = True
    readings: list[TelemetryReading]
