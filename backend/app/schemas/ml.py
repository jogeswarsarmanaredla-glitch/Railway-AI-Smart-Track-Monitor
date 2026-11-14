"""Pydantic schemas for Railway AI ML diagnostics and predictions."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ModelInfoResponse(BaseModel):
    model_version: str
    trained_at: str
    dataset_provenance: str
    is_simulated: bool = True
    safety_disclaimer: str
    random_seed: int
    classes: List[str]
    feature_names: List[str]
    training_summary: Dict[str, Any]
    evaluation_metrics: Dict[str, Any]
    anomaly_calibration: Dict[str, Any]
    normal_baseline_stats: Optional[Dict[str, Any]] = None


class PredictRequest(BaseModel):
    track_id: Optional[str] = Field(default=None, description="Optional track ID to score from simulator buffer")
    window_size: int = Field(default=20, ge=5, le=50, description="Rolling window size in samples")
    readings: Optional[List[Dict[str, Any]]] = Field(default=None, description="Custom explicit telemetry window")


class PredictResponse(BaseModel):
    prediction_id: str
    track_segment_id: str
    timestamp: str
    predicted_fault: str
    confidence_score: float = Field(..., description="Top class probability from calibrated classifier [0, 1]")
    class_probabilities: Dict[str, float] = Field(..., description="Class probability distribution across 4 classes")
    anomaly_score: float = Field(..., description="Continuous IsolationForest baseline deviation index [0, 1]")
    anomaly_threshold: float = Field(..., description="Calibrated anomaly decision threshold")
    is_anomaly: bool = Field(..., description="True if anomaly_score >= anomaly_threshold")
    window_size: int
    features_snapshot: Dict[str, float]
    feature_deviations: Optional[Dict[str, float]] = Field(
        default=None,
        description="Non-causal standardized feature deviations relative to nominal baseline statistics (z-scores)",
    )
    maintenance_recommendation: str = Field(..., description="Non-operational advisory suggestion")
    is_simulated: bool = True
    data_source: str
    safety_disclaimer: str


class PredictionHistoryItem(BaseModel):
    prediction_id: str
    track_segment_id: str
    timestamp: str
    predicted_fault: str
    confidence_score: float
    anomaly_score: float
    is_anomaly: bool
    is_simulated: bool = True


class PredictionHistoryResponse(BaseModel):
    total: int
    data_source: str = "SYNTHETIC_SIMULATION_ENGINE_RUNS"
    is_simulated: bool = True
    predictions: List[PredictionHistoryItem]
    limit: Optional[int] = None
    offset: Optional[int] = None


class PredictionDetailResponse(BaseModel):
    prediction_id: str
    track_segment_id: str
    timestamp: str
    predicted_fault: str
    confidence_score: float
    class_probabilities: Dict[str, float]
    anomaly_score: float
    anomaly_threshold: float
    is_anomaly: bool
    window_size: int
    features_snapshot: Dict[str, Any]
    feature_deviations: Optional[Dict[str, float]] = None
    maintenance_recommendation: str
    model_version: str
    is_simulated: bool = True
    data_source: str
    safety_disclaimer: str = (
        "Non-operational benchmark prototype. Synthetic simulation data only. "
        "Not certified for physical railway safety or signaling operations."
    )

