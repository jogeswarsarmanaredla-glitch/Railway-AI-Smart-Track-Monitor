"""Comprehensive Test Suite for Railway AI Phase 2 Endpoints & Simulation."""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify system health endpoint."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["data_source"] == "SIMULATED_MOCK_ENGINE"
    assert "telemetry_simulator" in data["active_modules"]


def test_dashboard_summary():
    """Verify /api/v1/dashboard/summary payload structure and data labeling."""
    res = client.get("/api/v1/dashboard/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["is_simulated"] is True
    assert data["data_source"] == "SYNTHETIC_SIMULATION_ENGINE"
    assert data["total_tracks_monitored"] >= 4
    assert "overall_health_score" in data
    assert len(data["tracks"]) >= 4
    for track in data["tracks"]:
        assert "track_segment_id" in track
        assert "latest_rms" in track


def test_telemetry_latest():
    """Verify /api/v1/telemetry/latest returns 3-axis vibration and environmental data."""
    res = client.get("/api/v1/telemetry/latest")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 4
    for item in data:
        assert item["is_simulated"] is True
        assert item["data_source"] == "SYNTHETIC_SIMULATION_ENGINE"
        assert "vibration_x" in item
        assert "vibration_y" in item
        assert "vibration_z" in item
        assert "temperature_c" in item
        assert "humidity_pct" in item


def test_telemetry_history_filtered():
    """Verify /api/v1/telemetry/history supports track filtering."""
    res = client.get("/api/v1/telemetry/history?track_id=TRK-01&limit=15")
    assert res.status_code == 200
    data = res.json()
    assert data["track_segment_id"] == "TRK-01"
    assert data["is_simulated"] is True
    assert len(data["readings"]) <= 15
    for r in data["readings"]:
        assert r["track_segment_id"] == "TRK-01"


def test_alerts_endpoint():
    """Verify /api/v1/alerts response."""
    res = client.get("/api/v1/alerts")
    assert res.status_code == 200
    data = res.json()
    assert data["is_simulated"] is True
    assert "alerts" in data
    assert isinstance(data["alerts"], list)


def test_simulator_status_and_control():
    """Verify /api/v1/simulator/status and control actions."""
    # Check status
    res = client.get("/api/v1/simulator/status")
    assert res.status_code == 200
    status = res.json()
    assert status["is_simulated"] is True
    assert "nominal" in status["available_profiles"]

    # Step simulation
    step_res = client.post("/api/v1/simulator/control", json={"action": "step"})
    assert step_res.status_code == 200

    # Set profile to corrugation
    prof_res = client.post("/api/v1/simulator/control", json={"action": "set_profile", "profile": "corrugation"})
    assert prof_res.status_code == 200
    assert prof_res.json()["active_profile"] == "corrugation"

    # Reset back to nominal
    reset_res = client.post("/api/v1/simulator/control", json={"action": "set_profile", "profile": "nominal"})
    assert reset_res.status_code == 200
    assert reset_res.json()["active_profile"] == "nominal"


if __name__ == "__main__":
    print("Running Railway AI Phase 2 test suite...")
    test_health_endpoint()
    print("✓ test_health_endpoint passed")
    test_dashboard_summary()
    print("✓ test_dashboard_summary passed")
    test_telemetry_latest()
    print("✓ test_telemetry_latest passed")
    test_telemetry_history_filtered()
    print("✓ test_telemetry_history_filtered passed")
    test_alerts_endpoint()
    print("✓ test_alerts_endpoint passed")
    test_simulator_status_and_control()
    print("✓ test_simulator_status_and_control passed")
    print("All Phase 2 Backend API tests passed successfully!")
