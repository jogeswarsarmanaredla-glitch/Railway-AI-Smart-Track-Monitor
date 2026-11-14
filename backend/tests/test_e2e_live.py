"""Comprehensive Live End-to-End Test for All 19 Railway AI Registered Application Endpoints.

Runs a live uvicorn server against the dedicated test database 'railway_ai_test' to guarantee
zero leakage into the production database.
Tests all 19 registered FastAPI endpoints:
1.  GET /                                        (Root API Summary)
2.  GET /api/health                              (Health Check)
3.  GET /api/v1/dashboard/summary                (Dashboard KPI & Track Summary)
4.  GET /api/v1/telemetry/latest                 (Multi-Track Latest Readings)
5.  GET /api/v1/telemetry/history                (Time-Series Telemetry History)
6.  GET /api/v1/telemetry/export/csv             (Safe Formula-Escaped CSV Export)
7.  GET /api/v1/telemetry/analysis               (Kurtosis, Crest Factor, Lateral/Vertical Ratio)
8.  GET /api/v1/tracks                           (Track Segments from PostgreSQL)
9.  GET /api/v1/tracks/{track_id}/analytics      (Comprehensive Aggregated Track Analytics)
10. GET /api/v1/simulator/status                 (Simulator Status & Profile)
11. POST /api/v1/simulator/control               (Simulator Profile & Stepping)
12. POST /api/v1/simulator/reset                 (Simulator State Reset)
13. GET /api/v1/alerts                           (Railway Issue Alerts with Filters)
14. PATCH /api/v1/alerts/{alert_id}/acknowledge  (Alert Acknowledgment State Transition)
15. PATCH /api/v1/alerts/{alert_id}/resolve      (Alert Resolution State Transition)
16. GET /api/v1/ml/model-info                    (ML Architecture & Empirical Holdout Metrics)
17. POST /api/v1/ml/predict                      (Continuous ML Fault Diagnosis & Feature Deviations)
18. GET /api/v1/ml/predictions/history           (Filtered AI Inference History)
19. GET /api/v1/ml/predictions/{prediction_id}   (Full Single Prediction Explainability & Features)
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any, Dict, Optional, Tuple
import urllib.error
import urllib.request

# Ensure test runs against dedicated test database only
server_env = os.environ.copy()
server_env["POSTGRES_DB"] = "railway_ai_test"
server_env["ENVIRONMENT"] = "testing"

backend_dir = Path(__file__).resolve().parent.parent
log_path = backend_dir / "tests" / "uvicorn_e2e.log"
server_log_file = open(log_path, "w", encoding="utf-8")

# Launch live uvicorn backend with output redirected to disk file to prevent pipe buffer deadlocks
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    cwd=str(backend_dir),
    env=server_env,
    stdout=server_log_file,
    stderr=subprocess.STDOUT,
    text=True,
)


def http_req(path: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None, timeout: float = 8.0) -> Tuple[int, Any, Dict[str, str]]:
    """Execute an HTTP request with explicit Connection: close and socket draining."""
    url = f"http://127.0.0.1:8000{path}"
    data_bytes = json.dumps(payload).encode() if payload is not None else None
    headers = {"Connection": "close"}
    if payload is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        headers_dict = {k.lower(): v for k, v in r.headers.items()}
        try:
            body = json.loads(raw.decode()) if raw else {}
        except Exception:
            body = raw.decode()
        return r.status, body, headers_dict


endpoints_tested = []

try:
    # --------------------------------------------------------------------------
    # 0. Wait for Server Startup
    # --------------------------------------------------------------------------
    for _ in range(40):
        time.sleep(0.3)
        try:
            status, _, _ = http_req("/api/health", timeout=1.5)
            if status == 200:
                break
        except Exception:
            continue
    else:
        print("FAIL: Server did not start within allocated timeout.")
        sys.exit(1)

    # --------------------------------------------------------------------------
    # 1. Test GET / (Root API Summary)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/")
    assert status == 200
    assert "project" in data
    assert "version" in data
    assert "notice" in data
    endpoints_tested.append(("GET /", status, f"Project: {data['project']}, Version: {data['version']}"))

    # --------------------------------------------------------------------------
    # 2. Test GET /api/health (Health Check)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/health")
    assert status == 200
    assert data["status"] == "healthy"
    assert "postgresql_database" in data["active_modules"]
    endpoints_tested.append(("GET /api/health", status, f"Status: {data['status']}, Version: {data['version']}"))

    # --------------------------------------------------------------------------
    # 3. Test GET /api/v1/dashboard/summary
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/dashboard/summary")
    assert status == 200
    assert data["is_simulated"] is True
    assert data["total_tracks_monitored"] >= 4
    endpoints_tested.append((
        "GET /api/v1/dashboard/summary",
        status,
        f"Tracks: {data['total_tracks_monitored']}, Health: {data['overall_health_score']}",
    ))

    # --------------------------------------------------------------------------
    # 4. Test GET /api/v1/telemetry/latest
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/telemetry/latest")
    assert status == 200
    assert len(data) >= 4
    endpoints_tested.append((
        "GET /api/v1/telemetry/latest",
        status,
        f"Tracks: {len(data)}, Sample Vx: {data[0]['vibration_x']}g, Vz: {data[0]['vibration_z']}g",
    ))

    # --------------------------------------------------------------------------
    # 5. Test GET /api/v1/telemetry/history
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/telemetry/history?track_id=TRK-01&limit=10")
    assert status == 200
    assert data["track_segment_id"] == "TRK-01"
    assert len(data["readings"]) <= 10
    endpoints_tested.append((
        "GET /api/v1/telemetry/history",
        status,
        f"Track: TRK-01, Records: {len(data['readings'])}",
    ))

    # --------------------------------------------------------------------------
    # 6. Test GET /api/v1/telemetry/export/csv (Safe Formula-Escaped CSV Export)
    # --------------------------------------------------------------------------
    status, csv_text, headers = http_req("/api/v1/telemetry/export/csv?track_id=TRK-01&time_range=all")
    assert status == 200
    assert "text/csv" in headers.get("content-type", "")
    assert csv_text.startswith("# ==============================================================================")
    assert "reading_id,track_segment_id,timestamp_utc" in csv_text
    endpoints_tested.append((
        "GET /api/v1/telemetry/export/csv",
        status,
        f"CSV Export: Content-Type text/csv, Length: {len(csv_text)} bytes",
    ))

    # --------------------------------------------------------------------------
    # 7. Test GET /api/v1/telemetry/analysis (Vibration & Thermal Physical Metrics)
    # --------------------------------------------------------------------------
    # Step simulator 22 times so TRK-01 has a full 20-sample contiguous window
    for _ in range(22):
        http_req("/api/v1/simulator/control", method="POST", payload={"action": "step"})
        time.sleep(0.01)

    status, data, _ = http_req("/api/v1/telemetry/analysis?track_id=TRK-01")
    assert status == 200
    assert "vibration_metrics" in data
    assert "vz_kurtosis" in data["vibration_metrics"]
    assert "vz_crest_factor" in data["vibration_metrics"]
    assert "lateral_to_vertical_ratio" in data["vibration_metrics"]
    assert "thermal_metrics" in data
    assert "demonstration_thermal_status" in data["thermal_metrics"]
    thermal_st = data["thermal_metrics"]["demonstration_thermal_status"]
    endpoints_tested.append((
        "GET /api/v1/telemetry/analysis",
        status,
        f"Kurtosis: {data['vibration_metrics']['vz_kurtosis']}, Crest: {data['vibration_metrics']['vz_crest_factor']}, Thermal: {thermal_st}",
    ))

    # --------------------------------------------------------------------------
    # 8. Test GET /api/v1/tracks (Track Segments from PostgreSQL)
    # --------------------------------------------------------------------------
    status, tracks, _ = http_req("/api/v1/tracks")
    assert status == 200
    assert len(tracks) >= 4
    assert any(t["id"] == "TRK-01" for t in tracks)
    endpoints_tested.append((
        "GET /api/v1/tracks",
        status,
        f"Tracks count: {len(tracks)}, Monitored: {[t['id'] for t in tracks]}",
    ))

    # --------------------------------------------------------------------------
    # 9. Test GET /api/v1/tracks/{track_id}/analytics (Aggregated Track Analytics)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/tracks/TRK-01/analytics")
    assert status == 200
    assert data["track_id"] == "TRK-01"
    assert "vibration_rms" in data
    assert "temperature_c" in data
    assert "alerts_summary" in data
    endpoints_tested.append((
        "GET /api/v1/tracks/{track_id}/analytics",
        status,
        f"Track: {data['track_id']}, Records: {data['total_telemetry_records']}, RMS mean: {data['vibration_rms']['mean']}g",
    ))

    # --------------------------------------------------------------------------
    # 10. Test GET /api/v1/simulator/status
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/simulator/status")
    assert status == 200
    assert data["is_simulated"] is True
    endpoints_tested.append((
        "GET /api/v1/simulator/status",
        status,
        f"Running: {data['is_running']}, Profile: {data['active_profile']}",
    ))

    # --------------------------------------------------------------------------
    # 11. Test POST /api/v1/simulator/control (Profile Switch & Stepping)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/simulator/control", method="POST", payload={"action": "set_profile", "profile": "corrugation"})
    assert status == 200
    assert data["active_profile"] == "corrugation"

    for _ in range(3):
        http_req("/api/v1/simulator/control", method="POST", payload={"action": "step"})
        time.sleep(0.01)

    status, data, _ = http_req("/api/v1/simulator/control", method="POST", payload={"action": "set_profile", "profile": "nominal"})
    assert status == 200
    assert data["active_profile"] == "nominal"
    endpoints_tested.append((
        "POST /api/v1/simulator/control",
        status,
        f"Profile: {data['active_profile']}, Stepping: Verified",
    ))

    # --------------------------------------------------------------------------
    # 12. Test POST /api/v1/simulator/reset
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/simulator/reset", method="POST")
    assert status == 200
    assert data["is_simulated"] is True
    assert data["active_profile"] == "nominal"
    endpoints_tested.append((
        "POST /api/v1/simulator/reset",
        status,
        f"Simulator Reset: profile={data['active_profile']}, is_running={data['is_running']}",
    ))

    # Trigger defect steps after reset to generate an alert for testing
    http_req("/api/v1/simulator/control", method="POST", payload={"action": "set_profile", "profile": "corrugation"})
    for _ in range(4):
        http_req("/api/v1/simulator/control", method="POST", payload={"action": "step"})
        time.sleep(0.01)
    http_req("/api/v1/simulator/control", method="POST", payload={"action": "set_profile", "profile": "nominal"})

    # --------------------------------------------------------------------------
    # 13. Test GET /api/v1/alerts (Alerts List with Multi-Criteria Filtering)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/alerts?status=ACTIVE&limit=20")
    assert status == 200
    assert data["is_simulated"] is True
    assert data["total"] >= 1
    target_alert_id = None
    for a in data["alerts"]:
        if not a["acknowledged"]:
            target_alert_id = a["id"]
            break

    endpoints_tested.append((
        "GET /api/v1/alerts",
        status,
        f"Total alerts: {data['total']}, Active: {data['active_count']}",
    ))
    assert target_alert_id is not None, "Failed to retrieve an unacknowledged alert for testing"

    # --------------------------------------------------------------------------
    # 14. Test PATCH /api/v1/alerts/{alert_id}/acknowledge (State Transition)
    # --------------------------------------------------------------------------
    status, data, _ = http_req(f"/api/v1/alerts/{target_alert_id}/acknowledge", method="PATCH")
    assert status == 200
    assert data["status"] == "success"
    assert data["alert_id"] == target_alert_id
    assert data["acknowledged"] is True
    endpoints_tested.append((
        "PATCH /api/v1/alerts/{alert_id}/acknowledge",
        status,
        f"Alert: {target_alert_id}, Acknowledged: {data['acknowledged']}",
    ))

    # --------------------------------------------------------------------------
    # 15. Test PATCH /api/v1/alerts/{alert_id}/resolve (Resolution State Transition)
    # --------------------------------------------------------------------------
    status, data, _ = http_req(
        f"/api/v1/alerts/{target_alert_id}/resolve",
        method="PATCH",
        payload={"resolved_by": "SafetyInspectorLive"},
    )
    assert status == 200
    assert data["status"] == "success"
    assert data["alert_id"] == target_alert_id
    assert data["is_resolved"] is True
    assert data["resolved_by"] == "SafetyInspectorLive"
    assert data["resolved_at"] is not None
    endpoints_tested.append((
        "PATCH /api/v1/alerts/{alert_id}/resolve",
        status,
        f"Alert: {target_alert_id}, Resolved: True by {data['resolved_by']}",
    ))

    # --------------------------------------------------------------------------
    # 16. Test GET /api/v1/ml/model-info
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/ml/model-info")
    assert status == 200
    assert data["model_version"] == "1.0.0"
    assert data["is_simulated"] is True
    assert "normal_baseline_stats" in data
    accuracy = data["evaluation_metrics"]["accuracy"]
    endpoints_tested.append((
        "GET /api/v1/ml/model-info",
        status,
        f"Holdout Accuracy: {accuracy*100:.1f}%, Features: {len(data['feature_names'])}, Baseline Stats: OK",
    ))

    # --------------------------------------------------------------------------
    # 17. Test POST /api/v1/ml/predict (Continuous Window & Anomaly Score < 0.75)
    # --------------------------------------------------------------------------
    for _ in range(22):
        http_req("/api/v1/simulator/control", method="POST", payload={"action": "step"})
        time.sleep(0.01)

    status, data, _ = http_req(
        "/api/v1/ml/predict",
        method="POST",
        payload={"track_id": "TRK-01", "window_size": 20},
    )
    assert status == 200
    assert data["is_simulated"] is True
    assert data["predicted_fault"] == "NORMAL"
    assert data["confidence_score"] >= 0.85
    assert data["anomaly_score"] < 0.75, f"Expected anomaly_score < 0.75 on contiguous nominal window, got {data['anomaly_score']}"
    assert data["is_anomaly"] is False
    assert "feature_deviations" in data
    assert "vz_rms" in data["feature_deviations"]
    live_prediction_id = data["prediction_id"]
    endpoints_tested.append((
        "POST /api/v1/ml/predict",
        status,
        f"Diagnosis: {data['predicted_fault']} ({data['confidence_score']*100:.1f}%), Anomaly: {data['anomaly_score']}, Deviations: {len(data['feature_deviations'])}",
    ))

    # --------------------------------------------------------------------------
    # 18. Test GET /api/v1/ml/predictions/history (Filtered by Track & Fault)
    # --------------------------------------------------------------------------
    status, data, _ = http_req("/api/v1/ml/predictions/history?track_id=TRK-01&fault=NORMAL&limit=5")
    assert status == 200
    assert data["is_simulated"] is True
    assert data["total"] >= 1
    endpoints_tested.append((
        "GET /api/v1/ml/predictions/history",
        status,
        f"Records: {data['total']}, Filtered Track: TRK-01, Fault: NORMAL",
    ))

    # --------------------------------------------------------------------------
    # 19. Test GET /api/v1/ml/predictions/{prediction_id} (Full Explainability)
    # --------------------------------------------------------------------------
    status, data, _ = http_req(f"/api/v1/ml/predictions/{live_prediction_id}")
    assert status == 200
    assert data["prediction_id"] == live_prediction_id
    assert data["predicted_fault"] == "NORMAL"
    assert "features_snapshot" in data
    assert "feature_deviations" in data
    assert "class_probabilities" in data
    endpoints_tested.append((
        "GET /api/v1/ml/predictions/{prediction_id}",
        status,
        f"Pred ID: {data['prediction_id']}, Fault: {data['predicted_fault']}, Features: {len(data['features_snapshot'])}",
    ))

    # --------------------------------------------------------------------------
    # Print Verification Report
    # --------------------------------------------------------------------------
    print("\n================================================================================")
    print(f"ALL {len(endpoints_tested)} APPLICATION ENDPOINTS E2E VERIFIED SUCCESSFULLY")
    print("================================================================================")
    for idx, (ep, ep_status, detail) in enumerate(endpoints_tested, start=1):
        print(f"  [{idx:02d}/{len(endpoints_tested)}] [PASS] {ep:42s} -> HTTP {ep_status} ({detail})")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    server_log_file.close()
    print("\nSERVER_TERMINATED_CLEANLY")
