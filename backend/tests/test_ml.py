"""Comprehensive Test Suite for Railway AI ML Engine (Phase 3 & Phase 4 Corrections).

Tests:
1. Feature extraction numerical stability, temperature slope, and timestamp continuity.
2. Contiguous nominal window benchmark: anomaly score < 0.75 and is_anomaly is False.
3. Restart-gap rejection: disallows windows spanning dormancy gaps.
4. Insufficient samples: HTTP 409 warming-up response with valid count.
5. Anomaly threshold behaviour on nominal vs defect profiles.
6. Prediction after a complete new continuous window following a restart gap.
7. Model info and prediction history endpoints.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import numpy as np
from fastapi.testclient import TestClient

from app.core.tracks import TRACK_DEFINITIONS
from app.main import app
from app.ml.config import (
    DEFAULT_MAX_GAP_SECONDS,
    DEFAULT_SAMPLING_INTERVAL_SECONDS,
    DEFAULT_WINDOW_SIZE,
    FAULT_CLASSES,
    FEATURE_NAMES,
)
from app.ml.dataset_generator import generate_single_run
from app.ml.features import (
    extract_features_from_window,
    feature_dict_to_vector,
    select_continuous_window,
)
from app.ml.inference import ml_service
from app.services.simulator import simulator_service

client = TestClient(app)


def test_feature_extraction_stability_and_slope():
    """Verify feature extractor handles zero variance, constant values, and timestamp slope."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    # 20 contiguous readings over 38 seconds (2.0s interval) with constant 0.0 vibration and rising temp
    flat_window = [
        {
            "vibration_x": 0.0,
            "vibration_y": 0.0,
            "vibration_z": 0.0,
            "temperature_c": 20.0 + (i * 0.1),  # rising 1.9 deg C over 38s = 3.0 deg C/min
            "humidity_pct": 50.0,
            "train_speed_kmh": 0.0,
            "timestamp": now + timedelta(seconds=i * 2.0),
        }
        for i in range(20)
    ]

    features = extract_features_from_window(flat_window)

    # Check zero-handling
    assert features["vx_rms"] == 0.0
    assert features["vy_rms"] == 0.0
    assert features["vz_rms"] == 0.0
    assert features["vz_kurtosis"] == 0.0
    assert features["vz_crest_factor"] == 1.0  # Safe default when RMS is zero

    # Check duration and temperature slope in C/min
    assert abs(features["window_duration_seconds"] - 38.0) < 0.01
    assert abs(features["temp_slope_c_per_min"] - 3.0) < 0.05

    # Check vector shape and finite values
    vec = feature_dict_to_vector(features)
    assert len(vec) == len(FEATURE_NAMES)
    assert np.all(np.isfinite(vec))


def test_contiguous_nominal_window_anomaly_below_threshold():
    """Verify that a contiguous nominal benchmark window yields an anomaly index strictly below 0.75."""
    assert ml_service.is_loaded is True

    # Generate 20 continuous nominal readings using the authentic physics simulator benchmark
    nominal_window = generate_single_run(
        run_id="BENCHMARK-NOMINAL",
        track_config=TRACK_DEFINITIONS["TRK-01"],
        scenario="NORMAL",
        num_timesteps=20,
        seed=123,
    )

    pred = ml_service.predict_window(nominal_window, track_id="TRK-01")

    assert pred["predicted_fault"] == "NORMAL"
    assert pred["confidence_score"] >= 0.85
    assert pred["anomaly_score"] < 0.75, f"Expected anomaly_score < 0.75, got {pred['anomaly_score']}"
    assert pred["is_anomaly"] is False
    assert pred["window_size"] == 20


def test_restart_gap_rejection():
    """Verify that feature extraction and window selection strictly reject dormancy/restart gaps."""
    now = datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)

    # Window with 15 readings from earlier session, 900s gap, then 5 readings from restart
    old_readings = [
        {
            "vibration_x": 0.14,
            "vibration_y": 0.07,
            "vibration_z": 0.22,
            "temperature_c": 31.0,
            "humidity_pct": 54.0,
            "train_speed_kmh": 120.0,
            "timestamp": now + timedelta(seconds=i * 2.0),
        }
        for i in range(15)
    ]
    # Restart occurs 900 seconds (15 min) after last reading
    restart_start = old_readings[-1]["timestamp"] + timedelta(seconds=900)
    new_readings = [
        {
            "vibration_x": 0.14,
            "vibration_y": 0.07,
            "vibration_z": 0.22,
            "temperature_c": 31.5,
            "humidity_pct": 54.0,
            "train_speed_kmh": 120.0,
            "timestamp": restart_start + timedelta(seconds=i * 2.0),
        }
        for i in range(5)
    ]
    combined_discontinuous = old_readings + new_readings

    # 1. Direct feature extraction on discontinuous window MUST raise ValueError
    threw_continuity_error = False
    try:
        extract_features_from_window(combined_discontinuous)
    except ValueError as exc:
        threw_continuity_error = True
        assert "Discontinuous window" in str(exc)
        assert "exceeds maximum allowed threshold" in str(exc)
    assert threw_continuity_error, "Expected extract_features_from_window to reject discontinuous window"

    # 2. Continuous window selector MUST stop at the gap and refuse to cross it
    selected, valid_count = select_continuous_window(combined_discontinuous, required_samples=20)
    assert valid_count == 5  # Only 5 samples exist since the restart
    assert selected == []    # Insufficient continuous samples (5 < 20)


def test_insufficient_samples_http_409():
    """Verify that POST /api/v1/ml/predict returns HTTP 409 when continuous samples < 20."""
    now = datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)

    # Custom readings with only 12 continuous readings
    short_readings = [
        {
            "id": f"TEST-{i}",
            "track_segment_id": "TRK-01",
            "track_name": "Test Track",
            "vibration_x": 0.14,
            "vibration_y": 0.07,
            "vibration_z": 0.22,
            "vibration_rms": 0.16,
            "temperature_c": 31.0,
            "humidity_pct": 54.0,
            "train_speed_kmh": 120.0,
            "status": "NORMAL",
            "simulation_profile": "nominal",
            "is_simulated": True,
            "data_source": "SYNTHETIC_SIMULATION_ENGINE",
            "timestamp": (now + timedelta(seconds=i * 2.0)).isoformat(),
        }
        for i in range(12)
    ]

    res = client.post(
        "/api/v1/ml/predict",
        json={"track_id": "TRK-01", "window_size": 20, "readings": short_readings},
    )
    assert res.status_code == 409
    data = res.json()["detail"]
    assert data["valid_samples"] == 12
    assert data["required_samples"] == 20
    assert data["status"] == "warming_up"
    assert "Buffer warming up" in data["message"]


def test_anomaly_threshold_behaviour():
    """Verify that defect profiles produce elevated anomaly or distinct fault diagnosis."""
    now = datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)

    # Contiguous Corrugation window: periodic vertical oscillation
    corrugation_window = [
        {
            "vibration_x": 0.22,
            "vibration_y": 0.10,
            "vibration_z": 0.65 + (0.25 * np.sin(i * 0.8)),
            "temperature_c": 32.0,
            "humidity_pct": 50.0,
            "train_speed_kmh": 110.0,
            "timestamp": now + timedelta(seconds=i * 2.0),
        }
        for i in range(20)
    ]

    pred = ml_service.predict_window(corrugation_window, track_id="TRK-01")
    assert pred["predicted_fault"] == "RAIL_CORRUGATION"
    assert pred["confidence_score"] > 0.80

    # Contiguous Impact Defect window: sharp transient spikes
    impact_window = [
        {
            "vibration_x": 0.15 + (0.25 if i in (7, 14) else 0.0),
            "vibration_y": 0.08,
            "vibration_z": 0.22 + (1.20 if i in (7, 14) else 0.02),
            "temperature_c": 31.0,
            "humidity_pct": 52.0,
            "train_speed_kmh": 100.0,
            "timestamp": now + timedelta(seconds=i * 2.0),
        }
        for i in range(20)
    ]

    pred_impact = ml_service.predict_window(impact_window, track_id="TRK-01")
    assert pred_impact["predicted_fault"] == "IMPACT_DEFECT"
    assert pred_impact["confidence_score"] > 0.70


def test_prediction_after_complete_new_window():
    """Verify that once a full continuous 20-sample window is generated after a gap, inference succeeds."""
    now = datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)

    # 10 old readings from previous session
    old_readings = [
        {
            "vibration_x": 0.14,
            "vibration_y": 0.07,
            "vibration_z": 0.22,
            "temperature_c": 30.0,
            "humidity_pct": 55.0,
            "train_speed_kmh": 120.0,
            "timestamp": now + timedelta(seconds=i * 2.0),
        }
        for i in range(10)
    ]
    # Restart gap of 600s, then 20 brand-new continuous nominal readings from simulator
    fresh_continuous = generate_single_run(
        run_id="RESTART-RECOVERY",
        track_config=TRACK_DEFINITIONS["TRK-01"],
        scenario="NORMAL",
        num_timesteps=20,
        seed=456,
    )
    # Offset fresh timestamps to occur 600s after the old session
    gap_end = old_readings[-1]["timestamp"] + timedelta(seconds=600)
    for i, r in enumerate(fresh_continuous):
        r["timestamp"] = gap_end + timedelta(seconds=i * 2.0)

    full_history = old_readings + fresh_continuous

    selected, valid_count = select_continuous_window(full_history, required_samples=20)
    assert valid_count == 20
    assert len(selected) == 20

    pred = ml_service.predict_window(selected, track_id="TRK-01")
    assert pred["predicted_fault"] == "NORMAL"
    assert pred["anomaly_score"] < 0.75
    assert pred["is_anomaly"] is False


def test_api_ml_model_info():
    """Verify GET /api/v1/ml/model-info returns real holdout metrics."""
    res = client.get("/api/v1/ml/model-info")
    assert res.status_code == 200
    data = res.json()
    assert data["model_version"] == "1.0.0"
    assert data["is_simulated"] is True
    assert "evaluation_metrics" in data
    eval_m = data["evaluation_metrics"]
    assert "accuracy" in eval_m
    assert "confusion_matrix" in eval_m
    assert len(eval_m["confusion_matrix"]) == 4
    assert "anomaly_calibration" in data
    assert data["anomaly_calibration"]["calibrated_threshold"] >= 0.40


def test_api_ml_predict_and_history():
    """Verify POST /api/v1/ml/predict and GET /api/v1/ml/predictions/history with contiguous data."""
    # Ensure simulator has at least 20 contiguous readings by stepping
    for _ in range(22):
        simulator_service.step()

    res = client.post("/api/v1/ml/predict", json={"track_id": "TRK-01", "window_size": 20})
    assert res.status_code == 200
    pred = res.json()
    assert pred["track_segment_id"] == "TRK-01"
    assert pred["predicted_fault"] in FAULT_CLASSES
    assert pred["is_simulated"] is True
    assert pred["anomaly_score"] < 0.75
    assert pred["is_anomaly"] is False

    # Check prediction history
    hist_res = client.get("/api/v1/ml/predictions/history?limit=10")
    assert hist_res.status_code == 200
    hist = hist_res.json()
    assert hist["total"] >= 1
    assert hist["is_simulated"] is True
    assert hist["predictions"][0]["prediction_id"] == pred["prediction_id"]


if __name__ == "__main__":
    print("Running Railway AI Phase 3/4 ML test suite...")
    test_feature_extraction_stability_and_slope()
    print("✓ test_feature_extraction_stability_and_slope passed")
    test_contiguous_nominal_window_anomaly_below_threshold()
    print("✓ test_contiguous_nominal_window_anomaly_below_threshold passed")
    test_restart_gap_rejection()
    print("✓ test_restart_gap_rejection passed")
    test_insufficient_samples_http_409()
    print("✓ test_insufficient_samples_http_409 passed")
    test_anomaly_threshold_behaviour()
    print("✓ test_anomaly_threshold_behaviour passed")
    test_prediction_after_complete_new_window()
    print("✓ test_prediction_after_complete_new_window passed")
    test_api_ml_model_info()
    print("✓ test_api_ml_model_info passed")
    test_api_ml_predict_and_history()
    print("✓ test_api_ml_predict_and_history passed")
    print("ALL_PHASE_3_4_ML_REGRESSION_TESTS_PASSED_SUCCESSFULLY")
