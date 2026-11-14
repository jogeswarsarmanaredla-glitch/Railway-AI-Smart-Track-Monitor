"""Repository for track_segments database operations and track-level analytics."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.tracks import TRACK_DEFINITIONS
from app.models.alert import AlertRecord
from app.models.prediction import MLPredictionRecord
from app.models.telemetry import SensorTelemetry
from app.models.track import TrackSegment
from app.schemas.track import TrackAnalyticsResponse, TrackSegmentSchema


def seed_tracks_if_empty(session: Session) -> List[TrackSegment]:
    """Ensure baseline track segments are seeded idempotently."""
    existing_tracks = {t.id: t for t in session.scalars(select(TrackSegment)).all()}
    created = []

    for track_id, config in TRACK_DEFINITIONS.items():
        if track_id not in existing_tracks:
            line_type = "Express Passenger" if "Express" in config.name else (
                "Heavy Freight" if "Freight" in config.name else (
                    "Mountain Curved" if "Mountain" in config.name else "Coastal Transit"
                )
            )
            track = TrackSegment(
                id=config.segment_id,
                code=config.segment_id,
                name=config.name,
                line_type=line_type,
                base_speed_kmh=config.base_speed,
                nominal_temperature_c=config.base_temp,
                nominal_humidity_pct=config.base_humidity,
                health_status="NORMAL",
            )
            session.add(track)
            created.append(track)

    if created:
        session.commit()
        for t in created:
            session.refresh(t)

    return list(session.scalars(select(TrackSegment).order_by(TrackSegment.id)).all())


def get_track_by_id(session: Session, track_id: str) -> Optional[TrackSegment]:
    """Retrieve single track segment by ID."""
    return session.get(TrackSegment, track_id)


def list_tracks(session: Session) -> List[TrackSegmentSchema]:
    """List all monitored track segments as Pydantic schemas."""
    rows = session.scalars(select(TrackSegment).order_by(TrackSegment.id)).all()
    return [
        TrackSegmentSchema(
            id=t.id,
            code=t.code,
            name=t.name,
            line_type=t.line_type,
            base_speed_kmh=t.base_speed_kmh,
            nominal_temperature_c=t.nominal_temperature_c,
            nominal_humidity_pct=t.nominal_humidity_pct,
            health_status=t.health_status,
        )
        for t in rows
    ]


def get_track_analytics(session: Session, track_id: str) -> Optional[TrackAnalyticsResponse]:
    """Retrieve detailed analytical aggregations for an individual track segment from PostgreSQL."""
    track = session.get(TrackSegment, track_id)
    if not track:
        return None

    # 1. Aggregate statistics across all persistent telemetry for this track
    agg_stmt = select(
        func.count(SensorTelemetry.id),
        func.avg(SensorTelemetry.vibration_rms),
        func.min(SensorTelemetry.vibration_rms),
        func.max(SensorTelemetry.vibration_rms),
        func.avg(SensorTelemetry.temperature_c),
        func.min(SensorTelemetry.temperature_c),
        func.max(SensorTelemetry.temperature_c),
        func.avg(SensorTelemetry.vibration_z),
        func.max(SensorTelemetry.vibration_z),
        func.avg(SensorTelemetry.humidity_pct),
        func.avg(SensorTelemetry.train_speed_kmh),
        func.max(SensorTelemetry.train_speed_kmh),
    ).where(SensorTelemetry.track_segment_id == track_id)

    agg = session.execute(agg_stmt).one()
    count = agg[0] or 0

    # 2. Latest telemetry reading
    latest_r = session.scalar(
        select(SensorTelemetry)
        .where(SensorTelemetry.track_segment_id == track_id)
        .order_by(SensorTelemetry.timestamp.desc())
        .limit(1)
    )

    # 3. Alerts breakdown
    alerts = list(session.scalars(select(AlertRecord).where(AlertRecord.track_segment_id == track_id)).all())
    total_alerts = len(alerts)
    active_alerts = len([a for a in alerts if not a.is_resolved and not a.acknowledged])
    ack_alerts = len([a for a in alerts if not a.is_resolved and a.acknowledged])
    res_alerts = len([a for a in alerts if a.is_resolved])

    # 4. Latest ML prediction
    latest_p = session.scalar(
        select(MLPredictionRecord)
        .where(MLPredictionRecord.track_segment_id == track_id)
        .order_by(MLPredictionRecord.timestamp.desc())
        .limit(1)
    )
    latest_pred_data = None
    if latest_p:
        latest_pred_data = {
            "prediction_id": latest_p.prediction_id,
            "predicted_fault": latest_p.predicted_fault,
            "confidence_score": latest_p.confidence_score,
            "anomaly_score": latest_p.anomaly_score,
            "is_anomaly": latest_p.is_anomaly,
            "timestamp": latest_p.timestamp.isoformat(),
        }

    return TrackAnalyticsResponse(
        track_id=track.id,
        track_name=track.name,
        line_type=track.line_type,
        base_speed_kmh=track.base_speed_kmh,
        nominal_temperature_c=track.nominal_temperature_c,
        nominal_humidity_pct=track.nominal_humidity_pct,
        health_status=track.health_status,
        total_telemetry_records=count,
        vibration_rms={
            "mean": round(float(agg[1] or 0.0), 3),
            "min": round(float(agg[2] or 0.0), 3),
            "max": round(float(agg[3] or 0.0), 3),
            "latest": round(float(latest_r.vibration_rms if latest_r else 0.0), 3),
        },
        vibration_z={
            "mean": round(float(agg[7] or 0.0), 3),
            "max": round(float(agg[8] or 0.0), 3),
            "latest": round(float(latest_r.vibration_z if latest_r else 0.0), 3),
        },
        temperature_c={
            "mean": round(float(agg[4] or 0.0), 1),
            "min": round(float(agg[5] or 0.0), 1),
            "max": round(float(agg[6] or 0.0), 1),
            "latest": round(float(latest_r.temperature_c if latest_r else 0.0), 1),
        },
        humidity_pct={
            "mean": round(float(agg[9] or 0.0), 1),
            "latest": round(float(latest_r.humidity_pct if latest_r else 0.0), 1),
        },
        speed_kmh={
            "mean": round(float(agg[10] or 0.0), 1),
            "max": round(float(agg[11] or 0.0), 1),
            "latest": round(float(latest_r.train_speed_kmh if latest_r else 0.0), 1),
        },
        alerts_summary={
            "total": total_alerts,
            "active": active_alerts,
            "acknowledged": ack_alerts,
            "resolved": res_alerts,
        },
        latest_prediction=latest_pred_data,
        data_source="POSTGRESQL_PERSISTENT_STORAGE",
        is_simulated=True,
    )
