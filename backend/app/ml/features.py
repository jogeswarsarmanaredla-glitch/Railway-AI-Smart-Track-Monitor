"""Shared feature engineering pipeline for Railway AI ML Engine.

Processes rolling windows of sensor telemetry into stable, physically-explainable
feature vectors. Strictly shared between offline training and live inference.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Sequence, Union

import numpy as np

from app.ml.config import (
    DEFAULT_MAX_GAP_SECONDS,
    DEFAULT_SAMPLING_INTERVAL_SECONDS,
    DEFAULT_WINDOW_SIZE,
    FEATURE_NAMES,
    MAX_GAP_MULTIPLIER,
    MIN_WINDOW_SIZE,
)
from app.schemas.telemetry import TelemetryReading

# Numerical stability epsilon
EPS = 1e-9


def select_continuous_window(
    readings: Sequence[Any],
    required_samples: int = DEFAULT_WINDOW_SIZE,
    max_gap_seconds: Optional[float] = None,
    base_interval_seconds: float = DEFAULT_SAMPLING_INTERVAL_SECONDS,
    max_gap_multiplier: float = MAX_GAP_MULTIPLIER,
) -> Tuple[List[Any], int]:
    """Select the most recent contiguous sub-window of readings without dormancy gaps.

    Walks backwards from the latest reading. Inspects real timestamp differences between
    consecutive readings. If any step exceeds max_gap_seconds or is non-positive, traversal
    stops, guaranteeing that readings are never combined across a dormancy or restart gap.

    Returns:
        (continuous_window, valid_continuous_sample_count)
        - If valid_continuous_sample_count >= required_samples, continuous_window contains
          the latest `required_samples` continuous readings (chronological order).
        - If valid_continuous_sample_count < required_samples, continuous_window is empty.
    """
    if not readings:
        return [], 0

    if max_gap_seconds is None:
        max_gap_seconds = max(3.0, base_interval_seconds * max_gap_multiplier)

    n = len(readings)
    continuous_indices = [n - 1]
    curr_ts = _parse_timestamp(
        readings[n - 1].timestamp
        if hasattr(readings[n - 1], "timestamp")
        else readings[n - 1].get("timestamp", datetime.now())
    )

    for i in range(n - 1, 0, -1):
        prev_item = readings[i - 1]
        prev_ts = _parse_timestamp(
            prev_item.timestamp
            if hasattr(prev_item, "timestamp")
            else prev_item.get("timestamp", datetime.now())
        )
        dt = (curr_ts - prev_ts).total_seconds()

        # Continuity check: gap must be positive and within allowed threshold
        if 0.0 < dt <= max_gap_seconds:
            continuous_indices.append(i - 1)
            curr_ts = prev_ts
            if len(continuous_indices) == required_samples:
                break
        else:
            # Discontinuity (dormancy gap, restart gap, or non-monotonic time) detected
            break

    valid_samples = len(continuous_indices)
    if valid_samples >= required_samples:
        continuous_indices.reverse()
        selected_window = [readings[idx] for idx in continuous_indices]
        return selected_window, valid_samples

    return [], valid_samples


def _parse_timestamp(ts: Union[datetime, str, float, int]) -> datetime:
    """Safely parse timestamps from datetime objects, ISO strings, or epoch numbers."""
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts)
    if isinstance(ts, str):
        # Handle trailing Z or offsets
        clean_ts = ts.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(clean_ts)
        except ValueError:
            return datetime.now()
    return datetime.now()


def extract_features_from_window(
    window: Sequence[Union[TelemetryReading, Dict[str, Any]]],
    max_gap_seconds: Optional[float] = None,
) -> Dict[str, float]:
    """Extract a 23-dimensional feature dictionary from a rolling window of readings.

    Features include 3-axis vibration metrics, spatial RMS, kurtosis, crest factor,
    temperature statistics with actual-time slope (C/min), humidity, and speed.
    Guarantees numerical stability, validates timestamp continuity, and rejects
    windows containing dormancy or restart gaps.
    """
    if len(window) < MIN_WINDOW_SIZE:
        raise ValueError(
            f"Window length {len(window)} is smaller than minimum required ({MIN_WINDOW_SIZE})."
        )

    # Extract raw arrays with fallback defaults
    vx_list: List[float] = []
    vy_list: List[float] = []
    vz_list: List[float] = []
    temp_list: List[float] = []
    hum_list: List[float] = []
    speed_list: List[float] = []
    timestamps: List[datetime] = []

    for item in window:
        if isinstance(item, TelemetryReading):
            vx_list.append(float(item.vibration_x))
            vy_list.append(float(item.vibration_y))
            vz_list.append(float(item.vibration_z))
            temp_list.append(float(item.temperature_c))
            hum_list.append(float(item.humidity_pct))
            speed_list.append(float(item.train_speed_kmh))
            timestamps.append(_parse_timestamp(item.timestamp))
        elif isinstance(item, dict):
            vx_list.append(float(item.get("vibration_x", 0.0)))
            vy_list.append(float(item.get("vibration_y", 0.0)))
            vz_list.append(float(item.get("vibration_z", 0.0)))
            temp_list.append(float(item.get("temperature_c", 25.0)))
            hum_list.append(float(item.get("humidity_pct", 50.0)))
            speed_list.append(float(item.get("train_speed_kmh", 80.0)))
            timestamps.append(_parse_timestamp(item.get("timestamp", datetime.now())))
        else:
            raise TypeError(f"Unsupported reading item type: {type(item)}")

    # Timestamp continuity validation: reject windows containing dormancy gaps or non-monotonic times
    effective_max_gap = max_gap_seconds if max_gap_seconds is not None else DEFAULT_MAX_GAP_SECONDS
    for i in range(1, len(timestamps)):
        dt_step = (timestamps[i] - timestamps[i - 1]).total_seconds()
        if dt_step <= 0.0:
            raise ValueError(
                f"Non-positive timestamp interval ({dt_step:.3f}s) between sample {i-1} and {i}. Window rejected."
            )
        if dt_step > effective_max_gap:
            raise ValueError(
                f"Discontinuous window: timestamp gap of {dt_step:.2f}s between sample {i-1} and {i} "
                f"exceeds maximum allowed threshold ({effective_max_gap:.2f}s). Window rejected."
            )

    vx = np.nan_to_num(np.array(vx_list, dtype=np.float64), nan=0.0)
    vy = np.nan_to_num(np.array(vy_list, dtype=np.float64), nan=0.0)
    vz = np.nan_to_num(np.array(vz_list, dtype=np.float64), nan=0.0)
    temp = np.nan_to_num(np.array(temp_list, dtype=np.float64), nan=25.0)
    hum = np.nan_to_num(np.array(hum_list, dtype=np.float64), nan=50.0)
    speed = np.nan_to_num(np.array(speed_list, dtype=np.float64), nan=0.0)

    # 1. Rolling window time duration from actual timestamps
    dt_seconds = max(0.001, (timestamps[-1] - timestamps[0]).total_seconds())
    dt_minutes = dt_seconds / 60.0

    # 2. RMS Calculations (sqrt(mean(x^2))) with floor check
    vx_rms = float(np.sqrt(max(0.0, float(np.mean(vx**2)))))
    vy_rms = float(np.sqrt(max(0.0, float(np.mean(vy**2)))))
    vz_rms = float(np.sqrt(max(0.0, float(np.mean(vz**2)))))
    v_total_rms = float(np.sqrt((vx_rms**2 + vy_rms**2 + vz_rms**2) / 3.0))

    # 3. Mean & Standard Deviation
    vx_mean = float(np.mean(vx))
    vy_mean = float(np.mean(vy))
    vz_mean = float(np.mean(vz))

    vx_std = float(np.std(vx))
    vy_std = float(np.std(vy))
    vz_std = float(np.std(vz))

    # 4. Peak-to-Peak Amplitude
    vx_p2p = float(np.ptp(vx))
    vy_p2p = float(np.ptp(vy))
    vz_p2p = float(np.ptp(vz))

    # 5. Fisher Kurtosis for vertical impact (vz) with zero-variance guard
    if vz_std < EPS:
        vz_kurtosis = 0.0
    else:
        centered_vz = vz - vz_mean
        m4 = float(np.mean(centered_vz**4))
        m2 = float(np.mean(centered_vz**2))
        vz_kurtosis = float((m4 / (m2**2 + EPS)) - 3.0)
        if not math.isfinite(vz_kurtosis):
            vz_kurtosis = 0.0

    # 6. Crest factor (Peak / RMS) with zero-RMS guard
    if vz_rms < EPS:
        vz_crest_factor = 1.0
    else:
        peak_vz = float(np.max(np.abs(vz)))
        vz_crest_factor = float(peak_vz / (vz_rms + EPS))
        if not math.isfinite(vz_crest_factor):
            vz_crest_factor = 1.0

    # 7. Temperature statistics & Timestamp-based Slope in °C/min
    temp_mean = float(np.mean(temp))
    temp_max = float(np.max(temp))
    temp_min = float(np.min(temp))
    temp_slope_c_per_min = float((temp[-1] - temp[0]) / max(1e-4, dt_minutes))
    if not math.isfinite(temp_slope_c_per_min):
        temp_slope_c_per_min = 0.0

    # 8. Humidity statistics
    hum_mean = float(np.mean(hum))
    hum_std = float(np.std(hum))

    # 9. Train transit speed mean
    speed_mean = float(np.mean(speed))

    features: Dict[str, float] = {
        "vx_rms": round(vx_rms, 5),
        "vy_rms": round(vy_rms, 5),
        "vz_rms": round(vz_rms, 5),
        "v_total_rms": round(v_total_rms, 5),
        "vx_mean": round(vx_mean, 5),
        "vy_mean": round(vy_mean, 5),
        "vz_mean": round(vz_mean, 5),
        "vx_std": round(vx_std, 5),
        "vy_std": round(vy_std, 5),
        "vz_std": round(vz_std, 5),
        "vx_p2p": round(vx_p2p, 5),
        "vy_p2p": round(vy_p2p, 5),
        "vz_p2p": round(vz_p2p, 5),
        "vz_kurtosis": round(vz_kurtosis, 4),
        "vz_crest_factor": round(vz_crest_factor, 4),
        "temp_mean": round(temp_mean, 2),
        "temp_max": round(temp_max, 2),
        "temp_min": round(temp_min, 2),
        "temp_slope_c_per_min": round(temp_slope_c_per_min, 3),
        "hum_mean": round(hum_mean, 2),
        "hum_std": round(hum_std, 2),
        "train_speed_mean": round(speed_mean, 2),
        "window_duration_seconds": round(dt_seconds, 2),
    }

    # Verify that all expected feature keys exist
    for key in FEATURE_NAMES:
        if key not in features:
            raise KeyError(f"Missing feature: {key}")

    return features


def feature_dict_to_vector(features: Dict[str, float]) -> np.ndarray:
    """Convert feature dictionary into ordered numpy vector matching FEATURE_NAMES strictly."""
    vec = np.zeros(len(FEATURE_NAMES), dtype=np.float64)
    for idx, name in enumerate(FEATURE_NAMES):
        val = features.get(name, 0.0)
        vec[idx] = 0.0 if not math.isfinite(val) else val
    return vec
