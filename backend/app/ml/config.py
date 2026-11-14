"""Configuration constants and feature definitions for Railway AI ML Engine."""
from typing import List

# Diagnostic classes
FAULT_CLASSES: List[str] = [
    "NORMAL",
    "RAIL_CORRUGATION",
    "IMPACT_DEFECT",
    "THERMAL_STRESS",
]

# Ordered feature vector names (strictly enforced across training and inference)
FEATURE_NAMES: List[str] = [
    "vx_rms",
    "vy_rms",
    "vz_rms",
    "v_total_rms",
    "vx_mean",
    "vy_mean",
    "vz_mean",
    "vx_std",
    "vy_std",
    "vz_std",
    "vx_p2p",
    "vy_p2p",
    "vz_p2p",
    "vz_kurtosis",
    "vz_crest_factor",
    "temp_mean",
    "temp_max",
    "temp_min",
    "temp_slope_c_per_min",
    "hum_mean",
    "hum_std",
    "train_speed_mean",
    "window_duration_seconds",
]

# Rolling window sizing & continuity guard
DEFAULT_WINDOW_SIZE: int = 20  # 20 samples (~38s at 2.0s nominal interval)
MIN_CONTINUOUS_WINDOW_SIZE: int = 20  # Minimum contiguous samples required for ML inference
MIN_WINDOW_SIZE: int = 5

# Sampling interval and continuity guard parameters
DEFAULT_SAMPLING_INTERVAL_SECONDS: float = 2.0
MAX_GAP_MULTIPLIER: float = 2.5  # Accommodates normal event-loop/timer jitter (up to 5.0s)
DEFAULT_MAX_GAP_SECONDS: float = 5.0  # (2.0s * 2.5) Disallows dormant gaps > 5.0s

# Anomaly calibration defaults
DEFAULT_ANOMALY_THRESHOLD: float = 0.60

# Non-operational safety disclaimer
BENCHMARK_PROVENANCE: str = "SYNTHETIC_SIMULATION_ENGINE_RUNS"
SAFETY_DISCLAIMER: str = (
    "Non-operational benchmark advisory. This model was trained and evaluated "
    "on synthetic benchmark telemetry. Outputs represent algorithmic diagnostic "
    "signals and do not certify actual operational railway safety."
)
