"""Repository for sensor_telemetry database operations, historical queries, and CSV export."""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
import io
from typing import Any, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.telemetry import SensorTelemetry
from app.schemas.telemetry import TelemetryReading


def _sanitize_csv_cell(val: Any) -> Any:
    """Neutralize spreadsheet formula injection by escaping leading control characters (=, +, -, @, \\t, \\r)."""
    if isinstance(val, str) and len(val) > 0 and val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val}"
    return val


def save_telemetry_batch(session: Session, readings: List[TelemetryReading]) -> int:
    """Save a batch of telemetry readings with duplicate prevention."""
    if not readings:
        return 0

    reading_ids = [r.id for r in readings]
    existing_ids = set(
        session.scalars(
            select(SensorTelemetry.reading_id).where(SensorTelemetry.reading_id.in_(reading_ids))
        ).all()
    )

    records_to_insert = []
    for r in readings:
        if r.id not in existing_ids:
            records_to_insert.append(
                SensorTelemetry(
                    reading_id=r.id,
                    track_segment_id=r.track_segment_id,
                    timestamp=r.timestamp,
                    vibration_x=r.vibration_x,
                    vibration_y=r.vibration_y,
                    vibration_z=r.vibration_z,
                    vibration_rms=r.vibration_rms,
                    temperature_c=r.temperature_c,
                    humidity_pct=r.humidity_pct,
                    train_speed_kmh=r.train_speed_kmh,
                    status=r.status,
                    simulation_profile=r.simulation_profile,
                    is_simulated=r.is_simulated,
                    data_source=r.data_source,
                )
            )

    if records_to_insert:
        session.add_all(records_to_insert)
        session.commit()

    return len(records_to_insert)


def get_recent_telemetry_for_hydration(
    session: Session, track_id: Optional[str] = None, limit: int = 50
) -> List[TelemetryReading]:
    """Retrieve recent telemetry ordered chronologically (ASC) for in-memory buffer hydration."""
    stmt = select(SensorTelemetry)
    if track_id:
        stmt = stmt.where(SensorTelemetry.track_segment_id == track_id)

    stmt = stmt.order_by(SensorTelemetry.timestamp.desc()).limit(limit)
    rows = list(session.scalars(stmt).all())
    rows.reverse()

    readings = []
    for row in rows:
        track_name = row.track.name if row.track else f"Track {row.track_segment_id}"
        readings.append(
            TelemetryReading(
                id=row.reading_id,
                track_segment_id=row.track_segment_id,
                track_name=track_name,
                timestamp=row.timestamp,
                vibration_x=row.vibration_x,
                vibration_y=row.vibration_y,
                vibration_z=row.vibration_z,
                vibration_rms=row.vibration_rms,
                temperature_c=row.temperature_c,
                humidity_pct=row.humidity_pct,
                train_speed_kmh=row.train_speed_kmh,
                status=row.status,
                simulation_profile=row.simulation_profile,
                is_simulated=row.is_simulated,
                data_source=row.data_source,
            )
        )

    return readings


def get_historical_telemetry_from_db(
    session: Session,
    track_id: Optional[str] = None,
    time_range: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 500,
) -> List[TelemetryReading]:
    """Retrieve time-series telemetry directly from PostgreSQL with time-range filtering."""
    stmt = select(SensorTelemetry)
    if track_id:
        stmt = stmt.where(SensorTelemetry.track_segment_id == track_id)

    now = datetime.now(timezone.utc)
    if time_range:
        tr = time_range.lower()
        if tr == "1h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=1))
        elif tr == "6h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=6))
        elif tr == "24h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=24))

    if start_time:
        stmt = stmt.where(SensorTelemetry.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(SensorTelemetry.timestamp <= end_time)

    limit = max(1, min(limit, 2000))
    stmt = stmt.order_by(SensorTelemetry.timestamp.desc()).limit(limit)
    rows = list(session.scalars(stmt).all())
    rows.reverse()

    readings = []
    for row in rows:
        track_name = row.track.name if row.track else f"Track {row.track_segment_id}"
        readings.append(
            TelemetryReading(
                id=row.reading_id,
                track_segment_id=row.track_segment_id,
                track_name=track_name,
                timestamp=row.timestamp,
                vibration_x=row.vibration_x,
                vibration_y=row.vibration_y,
                vibration_z=row.vibration_z,
                vibration_rms=row.vibration_rms,
                temperature_c=row.temperature_c,
                humidity_pct=row.humidity_pct,
                train_speed_kmh=row.train_speed_kmh,
                status=row.status,
                simulation_profile=row.simulation_profile,
                is_simulated=row.is_simulated,
                data_source="POSTGRESQL_PERSISTENT_STORAGE",
            )
        )
    return readings


def export_telemetry_csv(
    session: Session,
    track_id: Optional[str] = None,
    time_range: Optional[str] = None,
    limit: int = 5000,
) -> str:
    """Export actual PostgreSQL telemetry records to RFC 4180 CSV with safe spreadsheet escaping."""
    stmt = select(SensorTelemetry)
    if track_id:
        stmt = stmt.where(SensorTelemetry.track_segment_id == track_id)

    if time_range:
        tr = time_range.lower()
        now = datetime.now(timezone.utc)
        if tr == "1h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=1))
        elif tr == "6h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=6))
        elif tr == "24h":
            stmt = stmt.where(SensorTelemetry.timestamp >= now - timedelta(hours=24))

    limit = max(1, min(limit, 10000))
    stmt = stmt.order_by(SensorTelemetry.timestamp.desc()).limit(limit)
    rows = list(session.scalars(stmt).all())
    rows.reverse()

    output = io.StringIO()
    now_iso = datetime.now(timezone.utc).isoformat()
    output.write("# ==============================================================================\n")
    output.write("# Railway AI - Smart Track Monitoring Sensor Telemetry Export\n")
    output.write(f"# Exported At (UTC): {now_iso}\n")
    output.write(f"# Data Source: POSTGRESQL_PERSISTENT_STORAGE | Is Simulated: true\n")
    output.write(f"# Filter: Track={track_id or 'ALL_TRACKS'} | Record Count: {len(rows)}\n")
    output.write("# Disclaimer: Strictly synthetic benchmark sensor telemetry. Non-operational.\n")
    output.write("# ==============================================================================\n")

    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    headers = [
        "reading_id",
        "track_segment_id",
        "timestamp_utc",
        "vibration_x_g",
        "vibration_y_g",
        "vibration_z_g",
        "vibration_rms_g",
        "temperature_c",
        "humidity_pct",
        "train_speed_kmh",
        "status",
        "simulation_profile",
        "is_simulated",
        "data_source",
    ]
    writer.writerow(headers)

    for r in rows:
        writer.writerow([
            _sanitize_csv_cell(r.reading_id),
            _sanitize_csv_cell(r.track_segment_id),
            r.timestamp.isoformat(),
            round(r.vibration_x, 3),
            round(r.vibration_y, 3),
            round(r.vibration_z, 3),
            round(r.vibration_rms, 3),
            round(r.temperature_c, 1),
            round(r.humidity_pct, 1),
            round(r.train_speed_kmh, 1),
            _sanitize_csv_cell(r.status),
            _sanitize_csv_cell(r.simulation_profile),
            r.is_simulated,
            _sanitize_csv_cell(r.data_source),
        ])

    return output.getvalue()
