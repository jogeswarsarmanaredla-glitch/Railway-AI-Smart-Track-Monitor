"""Independent synthetic training and testing dataset generator.

Generates disjoint simulation runs across multiple track segments and scenario
definitions, enforcing zero-leakage run-level partitioning.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import numpy as np

from app.ml.config import DEFAULT_WINDOW_SIZE, FAULT_CLASSES
from app.ml.features import extract_features_from_window, feature_dict_to_vector
from app.core.tracks import TRACK_DEFINITIONS, RailwayTrackConfig


def generate_single_run(
    run_id: str,
    track_config: RailwayTrackConfig,
    scenario: str,
    num_timesteps: int = 70,
    seed: int = 42,
    base_interval_sec: float = 2.0,
) -> List[Dict[str, Any]]:
    """Synthesize an isolated continuous telemetry run with a dedicated random seed."""
    rng = random.Random(seed)
    start_time = datetime(2026, 1, 1, 8, 0, 0, tzinfo=timezone.utc)
    readings: List[Dict[str, Any]] = []

    curr_time = start_time
    for tick in range(num_timesteps):
        phase = tick * 0.2
        harmonic = math.sin(phase) * 0.04

        noise_x = rng.gauss(0, 0.02)
        noise_y = rng.gauss(0, 0.015)
        noise_z = rng.gauss(0, 0.03)

        vx = max(0.01, track_config.base_vx + harmonic + noise_x)
        vy = max(0.01, track_config.base_vy + (harmonic * 0.5) + noise_y)
        vz = max(0.02, track_config.base_vz + (harmonic * 1.5) + noise_z)

        temp_noise = rng.gauss(0, 0.2)
        hum_noise = rng.gauss(0, 0.5)
        temp_c = track_config.base_temp + (math.sin(tick * 0.05) * 1.5) + temp_noise
        hum_pct = track_config.base_humidity + (math.cos(tick * 0.05) * 2.0) + hum_noise
        speed = max(0.0, track_config.base_speed + rng.gauss(0, 2.0))

        # Scenario-specific signal modifications
        if scenario == "RAIL_CORRUGATION":
            # Sustained high-frequency vertical periodic wave
            vz += 0.35 + abs(math.sin(tick * 0.8)) * 0.28
            vx += 0.07
        elif scenario == "IMPACT_DEFECT":
            # Impulsive transient shock spikes
            if rng.random() < 0.35:
                vz += rng.uniform(0.65, 1.15)
                vx += rng.uniform(0.12, 0.25)
            else:
                vz += 0.12
        elif scenario == "THERMAL_STRESS":
            # Drastic temperature ramp representing thermal expansion buckling risk
            temp_c += 16.0 + (tick * 0.12) + rng.uniform(0.0, 2.0)
            hum_pct = max(10.0, hum_pct - 15.0)

        rms = math.sqrt((vx**2 + vy**2 + vz**2) / 3.0)

        readings.append(
            {
                "id": f"{run_id}-{tick:04d}",
                "run_id": run_id,
                "track_segment_id": track_config.segment_id,
                "track_name": track_config.name,
                "timestamp": curr_time,
                "vibration_x": round(vx, 3),
                "vibration_y": round(vy, 3),
                "vibration_z": round(vz, 3),
                "vibration_rms": round(rms, 3),
                "temperature_c": round(temp_c, 1),
                "humidity_pct": round(max(5.0, min(100.0, hum_pct)), 1),
                "train_speed_kmh": round(speed, 1),
                "scenario": scenario,
                "is_simulated": True,
            }
        )

        # Real timestamp progression with physical jitter (+/- 0.15s)
        jitter = rng.uniform(-0.15, 0.15)
        curr_time += timedelta(seconds=max(0.5, base_interval_sec + jitter))

    return readings


def extract_windows_from_run(
    run_readings: List[Dict[str, Any]],
    window_size: int = DEFAULT_WINDOW_SIZE,
    stride: int = 5,
) -> Tuple[np.ndarray, List[str], List[str]]:
    """Extract rolling windows from a single run with zero cross-run leakage."""
    features_list: List[np.ndarray] = []
    labels_list: List[str] = []
    runs_list: List[str] = []

    if len(run_readings) < window_size:
        return np.empty((0, len(FEATURE_NAMES))), [], []

    for i in range(0, len(run_readings) - window_size + 1, stride):
        window = run_readings[i : i + window_size]
        f_dict = extract_features_from_window(window)
        vec = feature_dict_to_vector(f_dict)

        scenario = window[-1]["scenario"]
        run_id = window[-1]["run_id"]

        features_list.append(vec)
        labels_list.append(scenario)
        runs_list.append(run_id)

    return np.array(features_list), labels_list, runs_list


def generate_benchmark_dataset(
    runs_per_scenario: int = 10,
    timesteps_per_run: int = 75,
    train_ratio: float = 0.70,
    master_seed: int = 42,
) -> Dict[str, Any]:
    """Generate train and test datasets strictly split on run_id.

    Guarantees:
    1. All windows from the same run_id belong exclusively to either Train or Test.
    2. All four classes are represented in both Train and Test splits.
    """
    track_keys = list(TRACK_DEFINITIONS.keys())
    all_runs: List[Dict[str, Any]] = []

    run_counter = 0
    # Generate balanced runs for every scenario across tracks
    for scenario in FAULT_CLASSES:
        for i in range(runs_per_scenario):
            run_counter += 1
            track_id = track_keys[i % len(track_keys)]
            track_config = TRACK_DEFINITIONS[track_id]
            run_id = f"RUN-{scenario[:4]}-{run_counter:03d}"
            run_seed = master_seed + run_counter * 101

            readings = generate_single_run(
                run_id=run_id,
                track_config=track_config,
                scenario=scenario,
                num_timesteps=timesteps_per_run,
                seed=run_seed,
            )

            is_train = (i / runs_per_scenario) < train_ratio
            all_runs.append(
                {
                    "run_id": run_id,
                    "scenario": scenario,
                    "is_train": is_train,
                    "readings": readings,
                }
            )

    train_X_list, train_y_list, train_groups = [], [], []
    test_X_list, test_y_list, test_groups = [], [], []

    for item in all_runs:
        X_run, y_run, groups_run = extract_windows_from_run(item["readings"])
        if len(X_run) == 0:
            continue

        if item["is_train"]:
            train_X_list.append(X_run)
            train_y_list.extend(y_run)
            train_groups.extend(groups_run)
        else:
            test_X_list.append(X_run)
            test_y_list.extend(y_run)
            test_groups.extend(groups_run)

    X_train = np.vstack(train_X_list)
    y_train = np.array(train_y_list)
    X_test = np.vstack(test_X_list)
    y_test = np.array(test_y_list)

    # Verification: check that all 4 classes are represented in both splits
    train_classes = set(y_train)
    test_classes = set(y_test)
    for c in FAULT_CLASSES:
        if c not in train_classes:
            raise ValueError(f"Class {c} missing from training split!")
        if c not in test_classes:
            raise ValueError(f"Class {c} missing from testing split!")

    # Check zero overlap of run_ids
    train_run_ids = set(train_groups)
    test_run_ids = set(test_groups)
    overlap = train_run_ids.intersection(test_run_ids)
    if overlap:
        raise ValueError(f"Data leakage detected! Overlapping run_ids: {overlap}")

    return {
        "X_train": X_train,
        "y_train": y_train,
        "train_groups": train_groups,
        "X_test": X_test,
        "y_test": y_test,
        "test_groups": test_groups,
        "metadata": {
            "total_runs": len(all_runs),
            "train_runs": len(train_run_ids),
            "test_runs": len(test_run_ids),
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "classes": FAULT_CLASSES,
        },
    }
