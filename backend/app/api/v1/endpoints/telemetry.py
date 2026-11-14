"""Telemetry streaming, PostgreSQL historical analysis, and CSV export endpoints."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories.telemetry_repo import export_telemetry_csv, get_historical_telemetry_from_db
from app.schemas.telemetry import TelemetryHistoryResponse, TelemetryReading
from app.services.simulator import simulator_service

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.get("/latest", response_model=List[TelemetryReading])
def get_latest_telemetry(
    track_id: Optional[str] = Query(None, description="Optional track segment code (e.g. TRK-01)")
):
    """Retrieve latest telemetry reading(s) for a track segment or all active tracks."""
    return simulator_service.get_latest_readings(track_id=track_id)


@router.get("/history", response_model=TelemetryHistoryResponse)
def get_telemetry_history(
    track_id: Optional[str] = Query(None, description="Optional track segment code (e.g. TRK-01)"),
    source: str = Query("buffer", description="'buffer' for in-memory live buffer, 'database' for PostgreSQL history"),
    time_range: Optional[str] = Query(None, description="For database queries: 1h, 6h, 24h, or all"),
    limit: int = Query(50, ge=1, le=1000, description="Number of records to retrieve"),
):
    """Retrieve time-series telemetry history for charting from either in-memory buffer or PostgreSQL."""
    if source.lower() == "database":
        try:
            with SessionLocal() as session:
                readings = get_historical_telemetry_from_db(
                    session=session,
                    track_id=track_id,
                    time_range=time_range,
                    limit=limit,
                )
                return TelemetryHistoryResponse(
                    track_segment_id=track_id,
                    total_records=len(readings),
                    data_source="POSTGRESQL_PERSISTENT_STORAGE",
                    is_simulated=True,
                    readings=readings,
                )
        except Exception as e:
            # Fallback to buffer if database query encounters an issue
            pass

    return simulator_service.get_history(track_id=track_id, limit=min(limit, 200))


@router.get("/export/csv")
def export_telemetry_as_csv(
    track_id: Optional[str] = Query(None, description="Optional track segment code (e.g. TRK-01)"),
    time_range: Optional[str] = Query(None, description="Optional time range filter ('1h', '6h', '24h', 'all')"),
    limit: int = Query(5000, ge=1, le=10000, description="Maximum number of historical records to export"),
):
    """Export actual PostgreSQL telemetry records to an RFC 4180 CSV file with safe formula escaping."""
    with SessionLocal() as session:
        csv_data = export_telemetry_csv(session, track_id=track_id, time_range=time_range, limit=limit)

    now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    target_slug = (track_id or "all_tracks").replace("-", "_").lower()
    filename = f"railway_telemetry_{target_slug}_{now_str}.csv"

    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


@router.get("/analysis")
def get_advanced_telemetry_analysis(
    track_id: str = Query("TRK-01", description="Track segment code to analyze"),
    window_size: int = Query(20, ge=5, le=50, description="Rolling window size in samples"),
) -> Dict[str, Any]:
    """Calculate advanced physical signal metrics (Kurtosis, Crest Factor, Lateral/Vertical Ratio, Thermal Slope)."""
    max_gap = settings.MAX_SAMPLE_GAP_SECONDS or (simulator_service._interval_seconds * 2.5)

    # Retrieve recent contiguous window from simulator buffer enforcing continuity guard
    continuous_window, valid_count = simulator_service.get_continuous_history(
        track_id=track_id, required_samples=window_size, max_gap_seconds=max_gap
    )

    if len(continuous_window) < window_size:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Buffer warming up: insufficient continuous telemetry ({valid_count}/{window_size} continuous samples available).",
                "valid_samples": valid_count,
                "required_samples": window_size,
                "track_segment_id": track_id,
                "status": "warming_up",
            },
        )

    from app.ml.features import extract_features_from_window
    try:
        f_dict = extract_features_from_window(continuous_window, max_gap_seconds=max_gap)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Analysis calculation error: {str(e)}")

    latest = continuous_window[-1]
    vx = float(latest.vibration_x)
    vy = float(latest.vibration_y)
    vz = float(latest.vibration_z)
    temp = float(latest.temperature_c)
    hum = float(latest.humidity_pct)
    speed = float(latest.train_speed_kmh)

    # Physical ratios
    lat_vert_ratio = round(abs(vx) / max(0.01, abs(vz)), 3)
    crest_factor = f_dict["vz_crest_factor"]
    kurtosis = f_dict["vz_kurtosis"]

    # Thermal gradient analysis (Demonstration thresholds: 45°C advisory, 55°C high-risk buckling demonstration)
    thermal_status = "NORMAL"
    if temp >= 55.0:
        thermal_status = "CRITICAL_BUCKLING_DEMO_RISK"
    elif temp >= 45.0:
        thermal_status = "ELEVATED_THERMAL_STRESS_DEMO"

    return {
        "track_segment_id": track_id,
        "sample_count": len(continuous_window),
        "window_duration_seconds": f_dict["window_duration_seconds"],
        "timestamp_latest": latest.timestamp.isoformat() if hasattr(latest.timestamp, "isoformat") else str(latest.timestamp),
        "vibration_metrics": {
            "vx_rms": f_dict["vx_rms"],
            "vy_rms": f_dict["vy_rms"],
            "vz_rms": f_dict["vz_rms"],
            "v_total_rms": f_dict["v_total_rms"],
            "vz_kurtosis": kurtosis,
            "vz_crest_factor": crest_factor,
            "lateral_to_vertical_ratio": lat_vert_ratio,
            "instantaneous": {
                "vx": vx,
                "vy": vy,
                "vz": vz,
            },
        },
        "thermal_metrics": {
            "temperature_c": temp,
            "temp_mean": f_dict["temp_mean"],
            "temp_max": f_dict["temp_max"],
            "temp_min": f_dict["temp_min"],
            "temp_slope_c_per_min": f_dict["temp_slope_c_per_min"],
            "humidity_pct": hum,
            "train_speed_kmh": speed,
            "demonstration_thermal_status": thermal_status,
            "demonstration_thresholds_note": "Thresholds of 45°C (elevated) and 55°C (buckling risk) are illustrative simulation demonstration values, not regulatory safety limits.",
        },
        "is_simulated": True,
        "data_source": "SYNTHETIC_SIMULATION_ENGINE",
    }
