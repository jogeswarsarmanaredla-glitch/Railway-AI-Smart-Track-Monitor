"""Simulator control and status schemas."""
from typing import List, Optional
from pydantic import BaseModel, Field


class SimulatorStatus(BaseModel):
    is_running: bool
    interval_seconds: float
    total_readings_generated: int
    active_profile: str
    available_profiles: List[str]
    monitored_tracks: List[str]
    data_source: str = "SYNTHETIC_SIMULATION_ENGINE"
    is_simulated: bool = True


class SimulatorControlRequest(BaseModel):
    action: str = Field(..., description="Action to take: start, stop, toggle, step, reset, set_profile")
    profile: Optional[str] = Field(default=None, description="Scenario: nominal, corrugation, impact_defect, thermal_stress")
    interval_seconds: Optional[float] = Field(default=None, description="Polling interval in seconds")
