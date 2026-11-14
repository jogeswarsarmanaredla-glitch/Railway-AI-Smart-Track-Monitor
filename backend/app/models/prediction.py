"""MLPredictionRecord SQLAlchemy 2.0 database model."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.track import TrackSegment


class MLPredictionRecord(Base):
    __tablename__ = "ml_predictions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    prediction_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    track_segment_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("track_segments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    predicted_fault: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    class_probabilities: Mapped[Dict[str, float]] = mapped_column(JSON, nullable=False)
    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False)
    anomaly_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    is_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
    window_size: Mapped[int] = mapped_column(Integer, nullable=False)
    features_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    maintenance_recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source: Mapped[str] = mapped_column(
        String(100), nullable=False, default="SYNTHETIC_SIMULATION_ENGINE_RUNS"
    )

    # Relationships
    track: Mapped[TrackSegment] = relationship(back_populates="predictions")

    __table_args__ = (
        Index("ix_ml_predictions_track_ts", "track_segment_id", "timestamp"),
    )
