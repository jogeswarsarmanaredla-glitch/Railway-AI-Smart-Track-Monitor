"""SensorTelemetry SQLAlchemy 2.0 database model."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.track import TrackSegment


class SensorTelemetry(Base):
    __tablename__ = "sensor_telemetry"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reading_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    track_segment_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("track_segments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    vibration_x: Mapped[float] = mapped_column(Float, nullable=False)
    vibration_y: Mapped[float] = mapped_column(Float, nullable=False)
    vibration_z: Mapped[float] = mapped_column(Float, nullable=False)
    vibration_rms: Mapped[float] = mapped_column(Float, nullable=False)
    temperature_c: Mapped[float] = mapped_column(Float, nullable=False)
    humidity_pct: Mapped[float] = mapped_column(Float, nullable=False)
    train_speed_kmh: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NORMAL", index=True)
    simulation_profile: Mapped[str] = mapped_column(String(50), nullable=False, default="nominal")
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source: Mapped[str] = mapped_column(
        String(100), nullable=False, default="SYNTHETIC_SIMULATION_ENGINE"
    )

    # Relationships
    track: Mapped[TrackSegment] = relationship(back_populates="telemetry_readings")

    __table_args__ = (
        Index("ix_sensor_telemetry_track_ts", "track_segment_id", "timestamp"),
    )
