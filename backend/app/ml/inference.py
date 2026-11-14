"""Live inference service for Railway AI ML Engine with PostgreSQL Persistence.

Loads trained model artifacts, extracts rolling features from live telemetry buffers,
provides calibrated multi-class fault classification and anomaly scoring,
and persists predictions to PostgreSQL while retaining in-memory history.
"""
from __future__ import annotations

import json
import logging
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import joblib
import numpy as np

from app.core.database import SessionLocal
from app.ml.config import (
    BENCHMARK_PROVENANCE,
    DEFAULT_WINDOW_SIZE,
    FAULT_CLASSES,
    FEATURE_NAMES,
    MIN_WINDOW_SIZE,
    SAFETY_DISCLAIMER,
)
from app.ml.features import extract_features_from_window, feature_dict_to_vector
from app.repositories.prediction_repo import (
    get_recent_predictions_for_hydration,
    save_prediction as repo_save_prediction,
)
from app.schemas.telemetry import TelemetryReading

logger = logging.getLogger("railway_ai.ml_inference")
MODEL_DIR = Path(__file__).resolve().parent / "saved_models"

MAINTENANCE_ADVISORIES: Dict[str, str] = {
    "NORMAL": (
        "Non-operational advisory: Nominal baseline stability. "
        "Standard scheduled track inspection cycle applies."
    ),
    "RAIL_CORRUGATION": (
        "Non-operational advisory: Periodic harmonic vertical acceleration detected. "
        "Recommend acoustic track roughness survey and scheduled rail profile grinding."
    ),
    "IMPACT_DEFECT": (
        "Non-operational advisory: Impulsive shock acceleration peak detected. "
        "Recommend visual inspection for wheel flat defect or rail joint fracture."
    ),
    "THERMAL_STRESS": (
        "Non-operational advisory: High rail surface temperature and thermal gradient. "
        "Recommend track buckling hazard survey and speed mitigation review."
    ),
}


class MLInferenceService:
    def __init__(self):
        self.rf_model = None
        self.iforest_model = None
        self.scaler = None
        self.metadata: Dict[str, Any] = {}
        self.is_loaded: bool = False
        self._prediction_history: deque[Dict[str, Any]] = deque(maxlen=100)
        self.load_artifacts()
        self.hydrate_prediction_history()

    def load_artifacts(self) -> bool:
        """Load serialized model files and calibration metadata."""
        rf_path = MODEL_DIR / "track_fault_rf.joblib"
        if_path = MODEL_DIR / "track_anomaly_iforest.joblib"
        scaler_path = MODEL_DIR / "feature_scaler.joblib"
        meta_path = MODEL_DIR / "model_metadata.json"

        if rf_path.exists() and if_path.exists() and scaler_path.exists() and meta_path.exists():
            try:
                self.rf_model = joblib.load(rf_path)
                self.iforest_model = joblib.load(if_path)
                self.scaler = joblib.load(scaler_path)
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                self.is_loaded = True
                return True
            except Exception as e:
                logger.error(f"Failed to load ML model artifacts: {e}")
                self.is_loaded = False
                return False
        return False

    def hydrate_prediction_history(self) -> None:
        """Hydrate recent prediction records from PostgreSQL into memory."""
        try:
            with SessionLocal() as session:
                db_preds = get_recent_predictions_for_hydration(session, limit=50)
                if db_preds:
                    self._prediction_history.clear()
                    # db_preds is ordered DESC; append so newest remains at the front
                    for p in reversed(db_preds):
                        self._prediction_history.appendleft(p)
                    logger.info(f"Hydrated {len(db_preds)} prediction records from PostgreSQL.")
        except Exception as e:
            logger.warning(f"Could not hydrate predictions from PostgreSQL ({e}).")

    def predict_window(
        self,
        readings: Sequence[Any],
        track_id: Optional[str] = None,
        max_gap_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Perform feature extraction, fault classification, and anomaly scoring on a window."""
        if not self.is_loaded:
            if not self.load_artifacts():
                raise RuntimeError("ML models have not been trained or loaded.")

        if len(readings) < MIN_WINDOW_SIZE:
            raise ValueError(
                f"Window length {len(readings)} is insufficient (minimum {MIN_WINDOW_SIZE} required)."
            )

        # 1. Feature extraction using the identical shared pipeline with continuity validation
        f_dict = extract_features_from_window(readings, max_gap_seconds=max_gap_seconds)
        f_vec = feature_dict_to_vector(f_dict).reshape(1, -1)

        # 2. Scale features
        f_scaled = self.scaler.transform(f_vec)

        # 3. Supervised classification: RandomForestClassifier
        proba_array = self.rf_model.predict_proba(f_scaled)[0]
        class_probs = {
            cls_name: round(float(prob), 4)
            for cls_name, prob in zip(self.rf_model.classes_, proba_array)
        }

        # Predict top class
        predicted_idx = int(np.argmax(proba_array))
        predicted_fault = str(self.rf_model.classes_[predicted_idx])
        confidence_score = float(proba_array[predicted_idx])

        # 4. Unsupervised Anomaly Detection: IsolationForest
        raw_decision_score = float(self.iforest_model.decision_function(f_scaled)[0])

        calib_params = self.metadata.get("anomaly_calibration", {}).get(
            "calibration_params",
            {"dec_min": -0.05, "dec_max": 0.10, "score_spread": 0.15},
        )
        dec_max = calib_params["dec_max"]
        score_spread = max(0.01, calib_params["score_spread"])

        # Map to calibrated continuous anomaly score [0.0, 1.0]
        calibrated_anomaly_score = float(
            np.clip((dec_max - raw_decision_score) / score_spread, 0.0, 1.0)
        )
        threshold = float(
            self.metadata.get("anomaly_calibration", {}).get("calibrated_threshold", 0.75)
        )
        is_anomaly = bool(calibrated_anomaly_score >= threshold)

        # Non-operational maintenance suggestion
        recommendation = MAINTENANCE_ADVISORIES.get(
            predicted_fault,
            "Non-operational advisory: Visual inspection of track segment recommended.",
        )

        # Compute explainability feature deviations relative to NORMAL-only baseline statistics
        feature_deviations = self.compute_feature_deviations(f_dict)

        effective_track_id = track_id or (
            readings[-1].track_segment_id
            if hasattr(readings[-1], "track_segment_id")
            else readings[-1].get("track_segment_id", "UNKNOWN")
        )

        prediction_id = f"PRED-{uuid.uuid4().hex[:8].upper()}"
        timestamp = datetime.now(timezone.utc).isoformat()

        result = {
            "prediction_id": prediction_id,
            "track_segment_id": effective_track_id,
            "timestamp": timestamp,
            "predicted_fault": predicted_fault,
            "confidence_score": round(confidence_score, 4),
            "class_probabilities": class_probs,
            "anomaly_score": round(calibrated_anomaly_score, 4),
            "anomaly_threshold": threshold,
            "is_anomaly": is_anomaly,
            "window_size": len(readings),
            "features_snapshot": f_dict,
            "feature_deviations": feature_deviations,
            "maintenance_recommendation": recommendation,
            "model_version": self.metadata.get("model_version", "1.0.0"),
            "is_simulated": True,
            "data_source": BENCHMARK_PROVENANCE,
            "safety_disclaimer": SAFETY_DISCLAIMER,
        }

        # Store in circular prediction history buffer
        self._prediction_history.appendleft(
            {
                "prediction_id": prediction_id,
                "track_segment_id": effective_track_id,
                "timestamp": timestamp,
                "predicted_fault": predicted_fault,
                "confidence_score": round(confidence_score, 4),
                "anomaly_score": round(calibrated_anomaly_score, 4),
                "is_anomaly": is_anomaly,
                "is_simulated": True,
            }
        )

        # Persist prediction to PostgreSQL
        try:
            with SessionLocal() as session:
                repo_save_prediction(session, result)
        except Exception as e:
            logger.error(f"Failed to persist prediction to PostgreSQL: {e}")

        return result

    def compute_feature_deviations(self, f_dict: Dict[str, Any]) -> Dict[str, float]:
        """Compute non-causal standardized deviations relative to NORMAL-only baseline statistics."""
        if not self.is_loaded:
            self.load_artifacts()
        baseline_stats = self.metadata.get("normal_baseline_stats", {})
        deviations: Dict[str, float] = {}
        for fname in FEATURE_NAMES:
            val = float(f_dict.get(fname, 0.0))
            st = baseline_stats.get(fname, {"mean": val, "std": 1.0})
            m = float(st.get("mean", val))
            s = max(1e-4, float(st.get("std", 1.0)))
            deviations[fname] = round(float((val - m) / s), 3)
        return deviations

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return recent prediction records."""
        limit = max(1, min(limit, 100))
        return list(self._prediction_history)[:limit]

    def get_model_info(self) -> Dict[str, Any]:
        """Return model metadata, classes, features, and empirical holdout evaluation."""
        if not self.is_loaded:
            self.load_artifacts()
        return self.metadata


# Singleton instance
ml_service = MLInferenceService()
