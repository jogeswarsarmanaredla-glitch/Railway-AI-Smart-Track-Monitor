"""TrackSegment SQLAlchemy 2.0 database model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, List

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.alert import AlertRecord
    from app.models.prediction import MLPredictionRecord
    from app.models.telemetry import SensorTelemetry


class TrackSegment(Base):
    __tablename__ = "track_segments"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # e.g. "TRK-01"
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    line_type: Mapped[str] = mapped_column(String(50), nullable=False)
    base_speed_kmh: Mapped[float] = mapped_column(Float, nullable=False)
    nominal_temperature_c: Mapped[float] = mapped_column(Float, nullable=False)
    nominal_humidity_pct: Mapped[float] = mapped_column(Float, nullable=False)
    health_status: Mapped[str] = mapped_column(String(20), default="NORMAL", index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    telemetry_readings: Mapped[List[SensorTelemetry]] = relationship(
        back_populates="track", cascade="all, delete-orphan", lazy="selectin"
    )
    predictions: Mapped[List[MLPredictionRecord]] = relationship(
        back_populates="track", cascade="all, delete-orphan", lazy="selectin"
    )
    alerts: Mapped[List[AlertRecord]] = relationship(
        back_populates="track", cascade="all, delete-orphan", lazy="selectin"
    )
