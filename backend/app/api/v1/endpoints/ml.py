"""Machine Learning Fault Diagnosis and Anomaly Detection Endpoints."""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.database import SessionLocal
from app.ml.config import DEFAULT_WINDOW_SIZE, SAFETY_DISCLAIMER
from app.ml.features import select_continuous_window
from app.ml.inference import ml_service
from app.repositories.prediction_repo import get_filtered_predictions, get_prediction_by_id
from app.schemas.ml import (
    ModelInfoResponse,
    PredictionDetailResponse,
    PredictionHistoryItem,
    PredictionHistoryResponse,
    PredictRequest,
    PredictResponse,
)
from app.services.simulator import simulator_service

logger = logging.getLogger("railway_ai.api.ml")

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


@router.get("/model-info", response_model=ModelInfoResponse)
def get_model_info():
    """Retrieve model architecture, feature names, training setup, and real empirical evaluation metrics."""
    info = ml_service.get_model_info()
    if not info:
        raise HTTPException(
            status_code=503,
            detail="Machine learning model artifacts have not been trained or loaded.",
        )
    return info


@router.post("/predict", response_model=PredictResponse)
def predict_track_fault(request: PredictRequest):
    """Run real-time feature extraction, 4-class fault classification, and anomaly scoring.

    Enforces sampling continuity guard: extracts a contiguous window from live simulator buffer
    or validates custom readings. Returns HTTP 409 if fewer than required continuous readings exist.
    """
    target_track = request.track_id or "TRK-01"
    required_samples = request.window_size or DEFAULT_WINDOW_SIZE
    max_gap = settings.MAX_SAMPLE_GAP_SECONDS or (simulator_service._interval_seconds * 2.5)

    if request.readings:
        effective_track = request.track_id or "CUSTOM_WINDOW"
        continuous_window, valid_samples = select_continuous_window(
            readings=request.readings,
            required_samples=required_samples,
            max_gap_seconds=max_gap,
            base_interval_seconds=simulator_service._interval_seconds,
        )
    else:
        effective_track = target_track
        continuous_window, valid_samples = simulator_service.get_continuous_history(
            track_id=target_track,
            required_samples=required_samples,
            max_gap_seconds=max_gap,
        )

    # If fewer than required continuous readings exist: refuse inference and return HTTP 409
    if len(continuous_window) < required_samples:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"Buffer warming up: insufficient continuous telemetry ({valid_samples}/{required_samples} samples available). "
                    f"Dormancy gap detected; awaiting {required_samples - valid_samples} more continuous tick(s)."
                ),
                "valid_samples": valid_samples,
                "required_samples": required_samples,
                "track_segment_id": effective_track,
                "status": "warming_up",
            },
        )

    try:
        prediction = ml_service.predict_window(
            readings=continuous_window,
            track_id=effective_track,
            max_gap_seconds=max_gap,
        )
        return prediction
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Window validation error: {str(ve)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failure: {str(e)}")


@router.get("/predictions/history", response_model=PredictionHistoryResponse)
def get_prediction_history(
    track_id: Optional[str] = Query(None, description="Filter by track segment ID"),
    fault: Optional[str] = Query(None, description="Filter by fault class"),
    is_anomaly: Optional[bool] = Query(None, description="Filter by anomaly flag"),
    limit: int = Query(30, ge=1, le=200, description="Number of recent predictions to retrieve"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    source: str = Query("database", description="Data source: 'database' or 'buffer'"),
):
    """Retrieve recent AI inference records with confidence and anomaly scores."""
    if source == "database":
        try:
            with SessionLocal() as session:
                items, total = get_filtered_predictions(
                    session=session,
                    track_id=track_id,
                    fault=fault,
                    is_anomaly=is_anomaly,
                    limit=limit,
                    offset=offset,
                )
                pred_items = [
                    PredictionHistoryItem(
                        prediction_id=item["prediction_id"],
                        track_segment_id=item["track_segment_id"],
                        timestamp=item["timestamp"],
                        predicted_fault=item["predicted_fault"],
                        confidence_score=item["confidence_score"],
                        anomaly_score=item["anomaly_score"],
                        is_anomaly=item["is_anomaly"],
                        is_simulated=item.get("is_simulated", True),
                    )
                    for item in items
                ]
                return PredictionHistoryResponse(
                    total=total,
                    data_source="SYNTHETIC_SIMULATION_ENGINE_RUNS",
                    is_simulated=True,
                    predictions=pred_items,
                    limit=limit,
                    offset=offset,
                )
        except Exception as e:
            logger.warning(f"Database query failed for prediction history ({e}), falling back to buffer.")

    # Fallback or buffer source
    raw_history = ml_service.get_history(limit=100)
    filtered = []
    for item in raw_history:
        if track_id and item["track_segment_id"] != track_id:
            continue
        if fault and fault.upper() != "ALL" and item["predicted_fault"] != fault.upper():
            continue
        if is_anomaly is not None and item["is_anomaly"] != is_anomaly:
            continue
        filtered.append(item)

    total = len(filtered)
    paged = filtered[offset : offset + limit]
    items = [
        PredictionHistoryItem(
            prediction_id=item["prediction_id"],
            track_segment_id=item["track_segment_id"],
            timestamp=item["timestamp"],
            predicted_fault=item["predicted_fault"],
            confidence_score=item["confidence_score"],
            anomaly_score=item["anomaly_score"],
            is_anomaly=item["is_anomaly"],
            is_simulated=item.get("is_simulated", True),
        )
        for item in paged
    ]
    return PredictionHistoryResponse(
        total=total,
        data_source="SYNTHETIC_SIMULATION_ENGINE_RUNS",
        is_simulated=True,
        predictions=items,
        limit=limit,
        offset=offset,
    )


@router.get("/predictions/{prediction_id}", response_model=PredictionDetailResponse)
def get_prediction_detail(prediction_id: str):
    """Retrieve full details, features snapshot, and explainability for a single prediction."""
    detail = None
    try:
        with SessionLocal() as session:
            detail = get_prediction_by_id(session, prediction_id)
    except Exception as e:
        logger.warning(f"Failed to fetch prediction from database ({e}).")

    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction record '{prediction_id}' not found in database.",
        )

    # Compute explainability feature deviations using baseline stats
    snapshot = detail.get("features_snapshot") or {}
    deviations = ml_service.compute_feature_deviations(snapshot) if snapshot else None

    return PredictionDetailResponse(
        prediction_id=detail["prediction_id"],
        track_segment_id=detail["track_segment_id"],
        timestamp=detail["timestamp"],
        predicted_fault=detail["predicted_fault"],
        confidence_score=detail["confidence_score"],
        class_probabilities=detail["class_probabilities"],
        anomaly_score=detail["anomaly_score"],
        anomaly_threshold=detail["anomaly_threshold"],
        is_anomaly=detail["is_anomaly"],
        window_size=detail["window_size"],
        features_snapshot=snapshot,
        feature_deviations=deviations,
        maintenance_recommendation=detail["maintenance_recommendation"],
        model_version=detail.get("model_version", "1.0.0"),
        is_simulated=detail.get("is_simulated", True),
        data_source=detail.get("data_source", "SYNTHETIC_SIMULATION_ENGINE_RUNS"),
        safety_disclaimer=SAFETY_DISCLAIMER,
    )
