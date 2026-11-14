"""Comprehensive Test Suite for PostgreSQL Database Integration (Phase 4).

Tests:
1. Connectivity & schema initialization against the dedicated test database 'railway_ai_test'.
2. Track segments seeding idempotency and CRUD.
3. Telemetry batch insertion and duplicate prevention via unique reading_id.
4. AI prediction persistence with JSON feature maps.
5. Alert creation and state-transition persistence (acknowledgment).
6. Simulated restart and chronological buffer hydration.
"""
from datetime import datetime, timezone
from pathlib import Path
import sys
import uuid

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base, init_db
from app.models.alert import AlertRecord
from app.models.prediction import MLPredictionRecord
from app.models.telemetry import SensorTelemetry
from app.models.track import TrackSegment
from app.repositories.alert_repo import (
    acknowledge_alert,
    get_alerts_filtered,
    get_recent_alerts_for_hydration,
    resolve_alert,
    save_alert,
)
from app.repositories.prediction_repo import (
    get_filtered_predictions,
    get_prediction_by_id,
    get_recent_predictions_for_hydration,
    save_prediction,
)
from app.repositories.telemetry_repo import (
    _sanitize_csv_cell,
    export_telemetry_csv,
    get_historical_telemetry_from_db,
    get_recent_telemetry_for_hydration,
    save_telemetry_batch,
)
from app.repositories.track_repo import get_track_analytics, list_tracks, seed_tracks_if_empty
from app.schemas.alert import Alert
from app.schemas.telemetry import TelemetryReading

# Dedicated test database connection URI derived from settings
TEST_DB_URL = settings.sqlalchemy_database_url.replace(f"/{settings.POSTGRES_DB}", "/railway_ai_test")
test_engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def setup_module():
    """Create all tables in the test database."""
    init_db(target_engine=test_engine)


def test_track_seeding_and_crud():
    """Verify track segments seeding idempotency."""
    with TestSessionLocal() as session:
        # First seeding
        tracks1 = seed_tracks_if_empty(session)
        assert len(tracks1) >= 4
        # Second seeding should be idempotent
        tracks2 = seed_tracks_if_empty(session)
        assert len(tracks1) == len(tracks2)

        # List tracks
        all_tracks = list_tracks(session)
        ids = [t.id for t in all_tracks]
        assert "TRK-01" in ids
        assert "TRK-02" in ids


def test_telemetry_batch_insert_and_duplicate_prevention():
    """Verify batch insert and duplicate rejection on reading_id."""
    now = datetime.now(timezone.utc)
    test_reading_id = f"TEST-TEL-{uuid.uuid4().hex[:6]}"

    reading = TelemetryReading(
        id=test_reading_id,
        track_segment_id="TRK-01",
        track_name="North Corridor Line 1 (Express)",
        timestamp=now,
        vibration_x=0.15,
        vibration_y=0.08,
        vibration_z=0.22,
        vibration_rms=0.17,
        temperature_c=31.5,
        humidity_pct=52.0,
        train_speed_kmh=130.0,
        status="NORMAL",
        simulation_profile="nominal",
        is_simulated=True,
        data_source="SYNTHETIC_SIMULATION_ENGINE",
    )

    with TestSessionLocal() as session:
        # First insert
        count1 = save_telemetry_batch(session, [reading])
        assert count1 == 1

        # Second insert with identical reading_id should be skipped (idempotent)
        count2 = save_telemetry_batch(session, [reading])
        assert count2 == 0

        # Retrieve and verify
        db_rows = get_recent_telemetry_for_hydration(session, track_id="TRK-01", limit=10)
        matching = [r for r in db_rows if r.id == test_reading_id]
        assert len(matching) == 1
        assert matching[0].vibration_z == 0.22


def test_alert_persistence_and_acknowledgment():
    """Verify alert record persistence and acknowledgment state transition."""
    test_alert_id = f"TEST-ALT-{uuid.uuid4().hex[:6]}"
    alert = Alert(
        id=test_alert_id,
        track_segment_id="TRK-02",
        severity="HIGH",
        title="Test Track Stress",
        description="Simulated testing alert description",
        metric="vibration_z",
        value=0.75,
        threshold=0.50,
        timestamp=datetime.now(timezone.utc),
        acknowledged=False,
        is_simulated=True,
        data_source="SYNTHETIC_SIMULATION_ENGINE",
    )

    with TestSessionLocal() as session:
        # Save alert
        saved = save_alert(session, alert)
        assert saved is True

        # Verify initial unacknowledged state
        alerts_before = get_recent_alerts_for_hydration(session, limit=10)
        target = next(a for a in alerts_before if a.id == test_alert_id)
        assert target.acknowledged is False

        # Acknowledge alert
        ack_success = acknowledge_alert(session, test_alert_id, acknowledged_by="TestEngineer")
        assert ack_success is True

        # Verify updated acknowledgment state in DB
        alerts_after = get_recent_alerts_for_hydration(session, limit=10)
        target_after = next(a for a in alerts_after if a.id == test_alert_id)
        assert target_after.acknowledged is True


def test_prediction_persistence():
    """Verify ML prediction persistence with complex JSON snapshot."""
    test_pred_id = f"TEST-PRED-{uuid.uuid4().hex[:6]}"
    pred_data = {
        "prediction_id": test_pred_id,
        "track_segment_id": "TRK-03",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "predicted_fault": "RAIL_CORRUGATION",
        "confidence_score": 0.985,
        "class_probabilities": {
            "NORMAL": 0.005,
            "RAIL_CORRUGATION": 0.985,
            "IMPACT_DEFECT": 0.005,
            "THERMAL_STRESS": 0.005,
        },
        "anomaly_score": 0.82,
        "anomaly_threshold": 0.75,
        "is_anomaly": True,
        "window_size": 20,
        "features_snapshot": {
            "vz_kurtosis": 4.5,
            "vz_crest_factor": 2.8,
            "vz_rms": 0.65,
        },
        "maintenance_recommendation": "Non-operational advisory: Recommend rail grinding inspection.",
        "model_version": "1.0.0",
        "is_simulated": True,
        "data_source": "SYNTHETIC_SIMULATION_ENGINE_RUNS",
    }

    with TestSessionLocal() as session:
        saved = save_prediction(session, pred_data)
        assert saved is True

        # Duplicate should be skipped
        saved_again = save_prediction(session, pred_data)
        assert saved_again is False

        # Retrieve and verify
        preds = get_recent_predictions_for_hydration(session, limit=10)
        matching = [p for p in preds if p["prediction_id"] == test_pred_id]
        assert len(matching) == 1
        assert matching[0]["predicted_fault"] == "RAIL_CORRUGATION"
        assert matching[0]["is_anomaly"] is True


def test_chronological_buffer_hydration():
    """Verify that readings retrieved for hydration preserve proper chronological order."""
    base_time = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    readings = []
    for i in range(5):
        readings.append(
            TelemetryReading(
                id=f"CHRONO-TEL-{i}-{uuid.uuid4().hex[:4]}",
                track_segment_id="TRK-04",
                track_name="South Coastal Transit Line",
                timestamp=base_time + datetime.resolution * i * 1000000,
                vibration_x=0.1,
                vibration_y=0.1,
                vibration_z=0.2,
                vibration_rms=0.15,
                temperature_c=25.0,
                humidity_pct=60.0,
                train_speed_kmh=80.0,
                status="NORMAL",
                simulation_profile="nominal",
                is_simulated=True,
                data_source="SYNTHETIC_SIMULATION_ENGINE",
            )
        )

    with TestSessionLocal() as session:
        save_telemetry_batch(session, readings)
        hydrated = get_recent_telemetry_for_hydration(session, track_id="TRK-04", limit=5)

        # Check chronological ordering (oldest first, newest last)
        timestamps = [r.timestamp for r in hydrated]
        assert timestamps == sorted(timestamps)


def test_track_analytics():
    """Verify track analytics repository aggregation."""
    with TestSessionLocal() as session:
        analytics = get_track_analytics(session, "TRK-01")
        assert analytics is not None
        assert analytics.track_id == "TRK-01"
        assert analytics.track_name is not None
        assert analytics.total_telemetry_records >= 0
        assert "mean" in analytics.vibration_rms
        assert "mean" in analytics.temperature_c
        assert "total" in analytics.alerts_summary
        assert analytics.is_simulated is True


def test_alert_resolution_and_filtered_search():
    """Verify alert resolution and multi-criteria filtered search."""
    test_alert_id = f"TEST-RES-{uuid.uuid4().hex[:6]}"
    alert = Alert(
        id=test_alert_id,
        track_segment_id="TRK-01",
        severity="CRITICAL",
        title="Impact Vibration Spike",
        description="Dangerous shock on TRK-01 rail joint",
        metric="vibration_z",
        value=0.92,
        threshold=0.80,
        timestamp=datetime.now(timezone.utc),
        acknowledged=False,
        is_simulated=True,
        data_source="SYNTHETIC_SIMULATION_ENGINE",
    )

    with TestSessionLocal() as session:
        save_alert(session, alert)

        # Resolve alert
        resolved = resolve_alert(session, test_alert_id, resolved_by="EngineerOperator")
        assert resolved is True

        # Verify filtered query by status=RESOLVED
        resolved_alerts, total_res, active_c, ack_c, res_c = get_alerts_filtered(session, status="RESOLVED", limit=20)
        assert any(a.id == test_alert_id for a in resolved_alerts)
        target = next(a for a in resolved_alerts if a.id == test_alert_id)
        assert target.is_resolved is True
        assert target.resolved_by == "EngineerOperator"
        assert target.resolved_at is not None

        # Verify search by text
        searched_alerts, _, _, _, _ = get_alerts_filtered(session, search="Dangerous shock")
        assert any(a.id == test_alert_id for a in searched_alerts)


def test_filtered_predictions_and_detail():
    """Verify prediction filtering and single record detail retrieval."""
    test_pred_id = f"TEST-FILT-PRED-{uuid.uuid4().hex[:6]}"
    pred_data = {
        "prediction_id": test_pred_id,
        "track_segment_id": "TRK-02",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "predicted_fault": "THERMAL_STRESS",
        "confidence_score": 0.94,
        "class_probabilities": {
            "NORMAL": 0.02,
            "RAIL_CORRUGATION": 0.02,
            "IMPACT_DEFECT": 0.02,
            "THERMAL_STRESS": 0.94,
        },
        "anomaly_score": 0.88,
        "anomaly_threshold": 0.75,
        "is_anomaly": True,
        "window_size": 20,
        "features_snapshot": {
            "temp_max": 52.3,
            "temp_slope": 1.45,
            "vz_rms": 0.28,
        },
        "maintenance_recommendation": "Non-operational advisory: Check thermal expansion joints.",
        "model_version": "1.0.0",
        "is_simulated": True,
        "data_source": "SYNTHETIC_SIMULATION_ENGINE_RUNS",
    }

    with TestSessionLocal() as session:
        save_prediction(session, pred_data)

        # Filter by fault class
        items, total = get_filtered_predictions(session, track_id="TRK-02", fault="THERMAL_STRESS")
        assert any(p["prediction_id"] == test_pred_id for p in items)

        # Detail by id
        detail = get_prediction_by_id(session, test_pred_id)
        assert detail is not None
        assert detail["prediction_id"] == test_pred_id
        assert detail["predicted_fault"] == "THERMAL_STRESS"
        assert detail["features_snapshot"]["temp_max"] == 52.3


def test_telemetry_historical_and_csv_export():
    """Verify historical telemetry retrieval and safe formula-escaped CSV export."""
    with TestSessionLocal() as session:
        # Query historical records
        records = get_historical_telemetry_from_db(session, track_id="TRK-01", time_range="all")
        assert isinstance(records, list)

        # Export CSV
        csv_content = export_telemetry_csv(session, track_id="TRK-01", time_range="all")
        assert csv_content.startswith("# ==============================================================================")
        assert "reading_id,track_segment_id,timestamp_utc" in csv_content

        # Test formula injection escaping
        assert _sanitize_csv_cell("=1+1") == "'=1+1"
        assert _sanitize_csv_cell("+cmd|") == "'+cmd|"
        assert _sanitize_csv_cell("-2+3") == "'-2+3"
        assert _sanitize_csv_cell("@SUM(A1:A5)") == "'@SUM(A1:A5)"
        assert _sanitize_csv_cell("TRK-01") == "TRK-01"


if __name__ == "__main__":
    print("Running Railway AI Phase 4 & Phase 5 PostgreSQL database test suite...")
    setup_module()
    test_track_seeding_and_crud()
    print("✓ test_track_seeding_and_crud passed")
    test_telemetry_batch_insert_and_duplicate_prevention()
    print("✓ test_telemetry_batch_insert_and_duplicate_prevention passed")
    test_alert_persistence_and_acknowledgment()
    print("✓ test_alert_persistence_and_acknowledgment passed")
    test_prediction_persistence()
    print("✓ test_prediction_persistence passed")
    test_chronological_buffer_hydration()
    print("✓ test_chronological_buffer_hydration passed")
    test_track_analytics()
    print("✓ test_track_analytics passed")
    test_alert_resolution_and_filtered_search()
    print("✓ test_alert_resolution_and_filtered_search passed")
    test_filtered_predictions_and_detail()
    print("✓ test_filtered_predictions_and_detail passed")
    test_telemetry_historical_and_csv_export()
    print("✓ test_telemetry_historical_and_csv_export passed")
    print("All Phase 4 & Phase 5 PostgreSQL database tests passed successfully!")

