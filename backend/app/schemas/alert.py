"""Alert schemas for Railway issue notifications."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Alert(BaseModel):
    id: str = Field(..., description="Unique alert identifier")
    track_segment_id: str = Field(..., description="Affected track segment")
    severity: str = Field(..., description="Severity level: LOW, MEDIUM, HIGH, CRITICAL")
    title: str = Field(..., description="Brief summary of the issue")
    description: str = Field(..., description="Detailed technical description")
    metric: str = Field(..., description="Triggering metric: vibration_z, temperature, etc.")
    value: float = Field(..., description="Observed metric value")
    threshold: float = Field(..., description="Configured alert threshold")
    timestamp: datetime = Field(..., description="When the alert triggered (UTC)")
    acknowledged: bool = Field(default=False, description="Whether an operator has acknowledged it")
    acknowledged_at: Optional[datetime] = Field(default=None, description="UTC timestamp of acknowledgment")
    acknowledged_by: Optional[str] = Field(default=None, description="Operator identifier")
    is_resolved: bool = Field(default=False, description="Whether the issue has been resolved")
    resolved_at: Optional[datetime] = Field(default=None, description="UTC timestamp of resolution")
    resolved_by: Optional[str] = Field(default=None, description="Resolver identifier")
    is_simulated: bool = Field(default=True, description="Strict synthetic data flag")
    data_source: str = Field(default="SYNTHETIC_SIMULATION_ENGINE", description="Data provenance label")


class AlertListResponse(BaseModel):
    total: int
    active_count: int
    acknowledged_count: int
    resolved_count: int = 0
    data_source: str = "SYNTHETIC_SIMULATION_ENGINE"
    is_simulated: bool = True
    alerts: list[Alert]
