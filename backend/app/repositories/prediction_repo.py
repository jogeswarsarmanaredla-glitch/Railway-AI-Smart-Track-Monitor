"""Repository for ml_predictions database operations."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.prediction import MLPredictionRecord


def save_prediction(session: Session, pred: Dict[str, Any]) -> bool:
    """Save an AI fault prediction record with duplicate prevention."""
    pred_id = pred["prediction_id"]
    existing = session.scalars(
        select(MLPredictionRecord).where(MLPredictionRecord.prediction_id == pred_id)
    ).first()

    if existing:
        return False

    # Parse ISO timestamp string if needed
    ts = pred["timestamp"]
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            ts = datetime.now()

    record = MLPredictionRecord(
        prediction_id=pred_id,
        track_segment_id=pred["track_segment_id"],
        timestamp=ts,
        predicted_fault=pred["predicted_fault"],
        confidence_score=float(pred["confidence_score"]),
        class_probabilities=pred["class_probabilities"],
        anomaly_score=float(pred["anomaly_score"]),
        anomaly_threshold=float(pred["anomaly_threshold"]),
        is_anomaly=bool(pred["is_anomaly"]),
        window_size=int(pred["window_size"]),
        features_snapshot=pred["features_snapshot"],
        maintenance_recommendation=pred["maintenance_recommendation"],
        model_version=pred.get("model_version", "1.0.0"),
        is_simulated=pred.get("is_simulated", True),
        data_source=pred.get("data_source", "SYNTHETIC_SIMULATION_ENGINE_RUNS"),
    )
    session.add(record)
    session.commit()
    return True


def get_recent_predictions_for_hydration(
    session: Session, limit: int = 50
) -> List[Dict[str, Any]]:
    """Retrieve recent prediction records for in-memory buffer hydration."""
    stmt = (
        select(MLPredictionRecord)
        .order_by(MLPredictionRecord.timestamp.desc())
        .limit(limit)
    )
    rows = session.scalars(stmt).all()

    return [
        {
            "prediction_id": r.prediction_id,
            "track_segment_id": r.track_segment_id,
            "timestamp": r.timestamp.isoformat(),
            "predicted_fault": r.predicted_fault,
            "confidence_score": r.confidence_score,
            "anomaly_score": r.anomaly_score,
            "is_anomaly": r.is_anomaly,
            "is_simulated": r.is_simulated,
        }
        for r in rows
    ]


def get_filtered_predictions(
    session: Session,
    track_id: Optional[str] = None,
    fault: Optional[str] = None,
    is_anomaly: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    """Retrieve filtered prediction records from PostgreSQL with pagination and total count."""
    stmt = select(MLPredictionRecord)
    if track_id:
        stmt = stmt.where(MLPredictionRecord.track_segment_id == track_id)
    if fault and fault.upper() != "ALL":
        stmt = stmt.where(MLPredictionRecord.predicted_fault == fault.upper())
    if is_anomaly is not None:
        stmt = stmt.where(MLPredictionRecord.is_anomaly == is_anomaly)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = session.scalar(count_stmt) or 0

    stmt = stmt.order_by(MLPredictionRecord.timestamp.desc()).offset(offset).limit(limit)
    rows = session.scalars(stmt).all()

    items = [
        {
            "prediction_id": r.prediction_id,
            "track_segment_id": r.track_segment_id,
            "timestamp": r.timestamp.isoformat(),
            "predicted_fault": r.predicted_fault,
            "confidence_score": r.confidence_score,
            "anomaly_score": r.anomaly_score,
            "is_anomaly": r.is_anomaly,
            "is_simulated": r.is_simulated,
        }
        for r in rows
    ]
    return items, total_count


def get_prediction_by_id(
    session: Session, prediction_id: str
) -> Optional[Dict[str, Any]]:
    """Retrieve a single prediction record with its full features snapshot and probabilities."""
    stmt = select(MLPredictionRecord).where(MLPredictionRecord.prediction_id == prediction_id)
    r = session.scalars(stmt).first()
    if not r:
        return None

    return {
        "prediction_id": r.prediction_id,
        "track_segment_id": r.track_segment_id,
        "timestamp": r.timestamp.isoformat(),
        "predicted_fault": r.predicted_fault,
        "confidence_score": r.confidence_score,
        "class_probabilities": r.class_probabilities,
        "anomaly_score": r.anomaly_score,
        "anomaly_threshold": r.anomaly_threshold,
        "is_anomaly": r.is_anomaly,
        "window_size": r.window_size,
        "features_snapshot": r.features_snapshot,
        "maintenance_recommendation": r.maintenance_recommendation,
        "model_version": r.model_version,
        "is_simulated": r.is_simulated,
        "data_source": r.data_source,
    }

