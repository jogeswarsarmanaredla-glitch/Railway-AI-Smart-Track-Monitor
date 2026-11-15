"""In-memory Railway Sensor Telemetry Simulator & Storage Engine with PostgreSQL Persistence.

Generates realistic 3-axis vibration (Vx, Vy, Vz), temperature, and humidity
telemetry for multiple railway track segments. All data is strictly synthetic.
Supports persistent storage in PostgreSQL and in-memory buffer hydration on startup.
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from app.core.database import SessionLocal
from app.repositories.alert_repo import (
    acknowledge_alert as repo_acknowledge_alert,
    get_recent_alerts_for_hydration,
    save_alert as repo_save_alert,
)
from app.repositories.telemetry_repo import (
    get_recent_telemetry_for_hydration,
    save_telemetry_batch,
)
from app.repositories.track_repo import seed_tracks_if_empty
from app.schemas.alert import Alert
from app.schemas.dashboard import DashboardSummary, TrackStatusSummary
from app.schemas.simulator import SimulatorStatus
from app.schemas.telemetry import TelemetryHistoryResponse, TelemetryReading

logger = logging.getLogger("railway_ai.simulator")


from app.core.tracks import PROFILES, TRACK_DEFINITIONS, RailwayTrackConfig


class SensorSimulatorService:
    def __init__(self):
        self._is_running: bool = True
        self._interval_seconds: float = 2.0
        self._active_profile: str = "nominal"
        self._tick_counter: int = 0
        self._total_generated: int = 0
        self._bg_task: Optional[asyncio.Task] = None

        # In-memory fast storage buffers (retained for sub-millisecond chart queries)
        self._track_buffers: Dict[str, deque[TelemetryReading]] = {
            t_id: deque(maxlen=200) for t_id in TRACK_DEFINITIONS
        }
        self._global_buffer: deque[TelemetryReading] = deque(maxlen=1000)
        self._alerts: deque[Alert] = deque(maxlen=100)
        self._last_step_time: Optional[datetime] = None

        # Hydrate from database or seed initial history
        self.init_and_hydrate()

    def init_and_hydrate(self) -> None:
        """Seed track definitions and hydrate in-memory buffers from PostgreSQL."""
        try:
            with SessionLocal() as session:
                # 1. Seed track segments table
                seed_tracks_if_empty(session)

                # 2. Hydrate telemetry buffers from DB
                total_hydrated = 0
                for track_id in TRACK_DEFINITIONS:
                    db_readings = get_recent_telemetry_for_hydration(
                        session, track_id=track_id, limit=35
                    )
                    if db_readings:
                        self._track_buffers[track_id].clear()
                        for r in db_readings:
                            self._track_buffers[track_id].append(r)
                            self._global_buffer.append(r)
                            total_hydrated += 1

                # 3. Hydrate alerts buffer from DB
                db_alerts = get_recent_alerts_for_hydration(session, limit=50)
                if db_alerts:
                    self._alerts.clear()
                    for a in db_alerts:
                        self._alerts.append(a)

                if total_hydrated > 0:
                    self._total_generated += total_hydrated
                    logger.info(f"Hydrated {total_hydrated} telemetry readings and {len(db_alerts)} alerts from PostgreSQL.")
                else:
                    # Fresh database: seed initial history and persist batch
                    self._seed_initial_history(count_per_track=35)
                    all_seeded = list(self._global_buffer)
                    save_telemetry_batch(session, all_seeded)
                    logger.info(f"Seeded and persisted initial {len(all_seeded)} telemetry records to PostgreSQL.")

        except Exception as e:
            logger.warning(f"Database unavailable during simulator initialization ({e}). Using in-memory seed.")
            if not any(len(b) > 0 for b in self._track_buffers.values()):
                self._seed_initial_history(count_per_track=35)

    def _seed_initial_history(self, count_per_track: int = 35) -> None:
        """Seed initial realistic data points with past timestamps."""
        now = datetime.now(timezone.utc)
        step = timedelta(seconds=self._interval_seconds)
        start_time = now - (step * count_per_track)

        for i in range(count_per_track):
            t_stamp = start_time + (step * i)
            for track_id, config in TRACK_DEFINITIONS.items():
                reading = self._generate_reading_for_track(config, t_stamp, profile="nominal")
                self._track_buffers[track_id].append(reading)
                self._global_buffer.append(reading)
                self._total_generated += 1

    def _generate_reading_for_track(
        self,
        config: RailwayTrackConfig,
        timestamp: datetime,
        profile: str,
    ) -> TelemetryReading:
        """Synthesize a physically-plausible reading according to the active profile."""
        phase = self._tick_counter * 0.2
        harmonic = math.sin(phase) * 0.04

        noise_x = random.gauss(0, 0.02)
        noise_y = random.gauss(0, 0.015)
        noise_z = random.gauss(0, 0.03)

        vx = max(0.01, config.base_vx + harmonic + noise_x)
        vy = max(0.01, config.base_vy + (harmonic * 0.5) + noise_y)
        vz = max(0.02, config.base_vz + (harmonic * 1.5) + noise_z)

        temp_noise = random.gauss(0, 0.2)
        humidity_noise = random.gauss(0, 0.5)
        temp_c = config.base_temp + (math.sin(self._tick_counter * 0.05) * 1.5) + temp_noise
        humidity_pct = config.base_humidity + (math.cos(self._tick_counter * 0.05) * 2.0) + humidity_noise
        speed = max(0.0, config.base_speed + random.gauss(0, 2.0))

        status = "NORMAL"

        if profile == "corrugation":
            vz += 0.35 + abs(math.sin(self._tick_counter * 0.8)) * 0.25
            vx += 0.08
            status = "WARNING"
            self._maybe_create_alert(
                config.segment_id,
                severity="MEDIUM",
                title=f"Elevated Rail Corrugation on {config.name}",
                description=f"Periodic vertical acceleration harmonic exceeded 0.50g. Measured: {vz:.2f}g.",
                metric="vibration_z",
                value=vz,
                threshold=0.50,
                timestamp=timestamp,
            )

        elif profile == "impact_defect":
            if random.random() < 0.4:
                vz += random.uniform(0.60, 0.95)
                vx += random.uniform(0.15, 0.30)
                status = "CRITICAL"
                self._maybe_create_alert(
                    config.segment_id,
                    severity="CRITICAL",
                    title=f"Severe Impact Shock on {config.name}",
                    description=f"Impulsive peak acceleration exceeded critical safety threshold 0.80g. Measured: {vz:.2f}g.",
                    metric="vibration_z",
                    value=vz,
                    threshold=0.80,
                    timestamp=timestamp,
                )
            else:
                vz += 0.20
                status = "WARNING"

        elif profile == "thermal_stress":
            temp_c += 15.0 + random.uniform(0, 3.0)
            status = "WARNING" if temp_c < 48.0 else "CRITICAL"
            self._maybe_create_alert(
                config.segment_id,
                severity="HIGH" if status == "WARNING" else "CRITICAL",
                title=f"Rail Thermal Stress Alert on {config.name}",
                description=f"Surface temperature exceeded safe threshold (45.0°C). Measured: {temp_c:.1f}°C.",
                metric="temperature_c",
                value=temp_c,
                threshold=45.0,
                timestamp=timestamp,
            )

        if vz > 0.70 and status == "NORMAL":
            status = "WARNING"
        elif vz > 0.85:
            status = "CRITICAL"

        rms = math.sqrt((vx**2 + vy**2 + vz**2) / 3.0)

        # Unique reading identifier for DB idempotency
        reading_id = f"TEL-{uuid.uuid4().hex[:10].upper()}"

        return TelemetryReading(
            id=reading_id,
            track_segment_id=config.segment_id,
            track_name=config.name,
            timestamp=timestamp,
            vibration_x=round(vx, 3),
            vibration_y=round(vy, 3),
            vibration_z=round(vz, 3),
            vibration_rms=round(rms, 3),
            temperature_c=round(temp_c, 1),
            humidity_pct=round(max(5.0, min(100.0, humidity_pct)), 1),
            train_speed_kmh=round(speed, 1),
            status=status,
            simulation_profile=profile,
            is_simulated=True,
            data_source="SYNTHETIC_SIMULATION_ENGINE",
        )

    def _maybe_create_alert(
        self,
        track_id: str,
        severity: str,
        title: str,
        description: str,
        metric: str,
        value: float,
        threshold: float,
        timestamp: datetime,
    ) -> None:
        """Throttle alert generation and persist to database."""
        recent_matches = [
            a for a in list(self._alerts)[:5]
            if a.track_segment_id == track_id and a.metric == metric and not a.acknowledged
        ]
        if not recent_matches:
            alert = Alert(
                id=f"ALT-{uuid.uuid4().hex[:8].upper()}",
                track_segment_id=track_id,
                severity=severity,
                title=title,
                description=description,
                metric=metric,
                value=round(value, 2),
                threshold=threshold,
                timestamp=timestamp,
                acknowledged=False,
                is_simulated=True,
                data_source="SYNTHETIC_SIMULATION_ENGINE",
            )
            self._alerts.appendleft(alert)

            # Persist to PostgreSQL
            try:
                with SessionLocal() as session:
                    repo_save_alert(session, alert)
            except Exception as e:
                logger.error(f"Failed to persist alert to PostgreSQL: {e}")

    def step(self) -> List[TelemetryReading]:
        """Manually execute one simulation tick across all tracks and persist batch."""
        self._tick_counter += 1
        now = datetime.now(timezone.utc)
        if self._last_step_time is not None and now <= self._last_step_time:
            now = self._last_step_time + timedelta(milliseconds=10)
        self._last_step_time = now
        new_readings = []

        for track_id, config in TRACK_DEFINITIONS.items():
            reading = self._generate_reading_for_track(config, now, self._active_profile)
            self._track_buffers[track_id].append(reading)
            self._global_buffer.append(reading)
            self._total_generated += 1
            new_readings.append(reading)

        # Batch persist to PostgreSQL
        try:
            with SessionLocal() as session:
                save_telemetry_batch(session, new_readings)
        except Exception as e:
            logger.error(f"Failed to persist telemetry batch to PostgreSQL: {e}")

        return new_readings

    async def start_background_loop(self) -> None:
        """Start async generator task."""
        self._is_running = True
        if self._bg_task is None or self._bg_task.done():
            self._bg_task = asyncio.create_task(self._run_loop())

    async def stop_background_loop(self) -> None:
        """Stop async generator task."""
        self._is_running = False
        if self._bg_task and not self._bg_task.done():
            self._bg_task.cancel()
            try:
                await self._bg_task
            except asyncio.CancelledError:
                pass
            self._bg_task = None

    async def _run_loop(self) -> None:
        """Internal background loop ticker."""
        while self._is_running:
            try:
                await asyncio.to_thread(self.step)
                await asyncio.sleep(self._interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Simulator loop error: {e}")
                await asyncio.sleep(self._interval_seconds)

    # --------------------------------------------------------------------------
    # Public Retrieval APIs
    # --------------------------------------------------------------------------

    def get_latest_readings(self, track_id: Optional[str] = None) -> List[TelemetryReading]:
        """Get latest reading for specific track or all tracks."""
        if track_id and track_id in self._track_buffers:
            buffer = self._track_buffers[track_id]
            return [buffer[-1]] if buffer else []

        latest = []
        for buffer in self._track_buffers.values():
            if buffer:
                latest.append(buffer[-1])
        return latest

    def get_history(self, track_id: Optional[str] = None, limit: int = 50) -> TelemetryHistoryResponse:
        """Return history buffer for a track or global timeline."""
        limit = max(1, min(limit, 200))
        if track_id and track_id in self._track_buffers:
            buffer = self._track_buffers[track_id]
            slice_data = list(buffer)[-limit:]
        else:
            slice_data = list(self._global_buffer)[-limit:]

        return TelemetryHistoryResponse(
            track_segment_id=track_id,
            total_records=len(slice_data),
            data_source="SYNTHETIC_SIMULATION_ENGINE",
            is_simulated=True,
            readings=slice_data,
        )

    def get_continuous_history(
        self,
        track_id: Optional[str] = None,
        required_samples: int = 20,
        max_gap_seconds: Optional[float] = None,
    ) -> tuple[List[TelemetryReading], int]:
        """Return the newest contiguous readings for a track up to required_samples, plus valid count.

        Enforces sampling continuity guard: refuses to traverse across dormancy or restart gaps.
        """
        raw_history = self.get_history(track_id=track_id, limit=max(60, required_samples * 3)).readings
        from app.ml.features import select_continuous_window
        return select_continuous_window(
            raw_history,
            required_samples=required_samples,
            max_gap_seconds=max_gap_seconds,
            base_interval_seconds=self._interval_seconds,
        )

    def get_alerts(self, severity: Optional[str] = None) -> List[Alert]:
        """Return alerts list with optional severity filter."""
        alerts = list(self._alerts)
        if severity:
            alerts = [a for a in alerts if a.severity.upper() == severity.upper()]
        return alerts

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Mark an alert as acknowledged in memory and PostgreSQL."""
        found = False
        for a in self._alerts:
            if a.id == alert_id:
                a.acknowledged = True
                found = True
                break

        # Sync acknowledgment with PostgreSQL
        try:
            with SessionLocal() as session:
                repo_acknowledge_alert(session, alert_id=alert_id)
        except Exception as e:
            logger.error(f"Failed to sync alert acknowledgment with PostgreSQL: {e}")

        return found

    def resolve_alert(self, alert_id: str, resolved_by: str = "Operator") -> bool:
        """Mark an alert as resolved in memory and PostgreSQL with UTC timestamps."""
        found = False
        now = datetime.now(timezone.utc)
        for a in self._alerts:
            if a.id == alert_id:
                a.is_resolved = True
                a.resolved_at = now
                a.resolved_by = resolved_by
                if not a.acknowledged:
                    a.acknowledged = True
                    a.acknowledged_at = now
                    a.acknowledged_by = resolved_by
                found = True
                break

        # Sync resolution with PostgreSQL
        db_success = False
        try:
            from app.repositories.alert_repo import resolve_alert as repo_resolve_alert
            with SessionLocal() as session:
                db_success = repo_resolve_alert(session, alert_id=alert_id, resolved_by=resolved_by)
        except Exception as e:
            logger.error(f"Failed to sync alert resolution with PostgreSQL: {e}")

        return found or db_success

    def get_dashboard_summary(self) -> DashboardSummary:
        """Calculate and return system-wide operational health summary."""
        latest_readings = self.get_latest_readings()
        active_alerts = [a for a in self._alerts if not a.acknowledged and not getattr(a, "is_resolved", False)]

        total_tracks = len(TRACK_DEFINITIONS)
        healthy_count = 0
        warning_count = 0
        critical_count = 0

        rms_values = []
        temp_values = []
        humidity_values = []
        track_summaries = []

        for reading in latest_readings:
            rms_values.append(reading.vibration_rms)
            temp_values.append(reading.temperature_c)
            humidity_values.append(reading.humidity_pct)

            track_alerts = len([a for a in active_alerts if a.track_segment_id == reading.track_segment_id])

            if reading.status == "CRITICAL" or (track_alerts > 0 and any(a.severity == "CRITICAL" for a in active_alerts)):
                critical_count += 1
                effective_status = "CRITICAL"
            elif reading.status == "WARNING" or track_alerts > 0:
                warning_count += 1
                effective_status = "WARNING"
            else:
                healthy_count += 1
                effective_status = "HEALTHY"

            track_summaries.append(
                TrackStatusSummary(
                    track_segment_id=reading.track_segment_id,
                    track_name=reading.track_name,
                    status=effective_status,
                    latest_rms=reading.vibration_rms,
                    latest_temp=reading.temperature_c,
                    latest_speed=reading.train_speed_kmh,
                    active_alerts=track_alerts,
                )
            )

        avg_rms = round(sum(rms_values) / len(rms_values), 3) if rms_values else 0.0
        avg_temp = round(sum(temp_values) / len(temp_values), 1) if temp_values else 0.0
        avg_hum = round(sum(humidity_values) / len(humidity_values), 1) if humidity_values else 0.0

        health_score = 100.0 - (critical_count * 25.0) - (warning_count * 10.0) - (len(active_alerts) * 4.0)
        health_score = max(10.0, min(100.0, round(health_score, 1)))

        if critical_count > 0:
            network_status = "CRITICAL"
        elif warning_count > 0 or len(active_alerts) > 0:
            network_status = "ATTENTION"
        else:
            network_status = "NORMAL"

        return DashboardSummary(
            project="Railway AI - Smart Track Monitoring",
            timestamp=datetime.now(timezone.utc),
            data_source="SYNTHETIC_SIMULATION_ENGINE",
            is_simulated=True,
            overall_health_score=health_score,
            network_status=network_status,
            total_tracks_monitored=total_tracks,
            healthy_tracks_count=healthy_count,
            warning_tracks_count=warning_count,
            critical_tracks_count=critical_count,
            active_alerts_count=len(active_alerts),
            system_average_vibration_rms=avg_rms,
            system_average_temperature_c=avg_temp,
            system_average_humidity_pct=avg_hum,
            simulation_running=self._is_running,
            tracks=track_summaries,
        )

    def get_status(self) -> SimulatorStatus:
        """Return operational state of the simulator."""
        return SimulatorStatus(
            is_running=self._is_running,
            interval_seconds=self._interval_seconds,
            total_readings_generated=self._total_generated,
            active_profile=self._active_profile,
            available_profiles=PROFILES,
            monitored_tracks=list(TRACK_DEFINITIONS.keys()),
            data_source="SYNTHETIC_SIMULATION_ENGINE",
            is_simulated=True,
        )

    def set_profile(self, profile: str) -> bool:
        if profile in PROFILES:
            self._active_profile = profile
            return True
        return False

    def set_interval(self, interval: float) -> None:
        self._interval_seconds = max(0.5, min(interval, 10.0))

    def reset(self) -> None:
        for buf in self._track_buffers.values():
            buf.clear()
        self._global_buffer.clear()
        self._alerts.clear()
        self._total_generated = 0
        self._tick_counter = 0
        self._active_profile = "nominal"
        self.init_and_hydrate()


# Singleton instance
simulator_service = SensorSimulatorService()
