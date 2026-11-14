"""Repository for alerts database operations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.alert import AlertRecord
from app.schemas.alert import Alert


def save_alert(session: Session, alert: Alert) -> bool:
    """Save an alert if it does not already exist."""
    existing = session.get(AlertRecord, alert.id)
    if existing:
        return False

    record = AlertRecord(
        id=alert.id,
        track_segment_id=alert.track_segment_id,
        severity=alert.severity,
        title=alert.title,
        description=alert.description,
        metric=alert.metric,
        value=alert.value,
        threshold=alert.threshold,
        timestamp=alert.timestamp,
        acknowledged=alert.acknowledged,
        acknowledged_at=alert.acknowledged_at,
        acknowledged_by=alert.acknowledged_by,
        is_resolved=alert.is_resolved,
        resolved_at=alert.resolved_at,
        resolved_by=alert.resolved_by,
        is_simulated=alert.is_simulated,
        data_source=alert.data_source,
    )
    session.add(record)
    session.commit()
    return True


def acknowledge_alert(
    session: Session, alert_id: str, acknowledged_by: Optional[str] = "Operator"
) -> bool:
    """Mark an alert as acknowledged in the database (idempotent)."""
    record = session.get(AlertRecord, alert_id)
    if not record:
        return False

    if not record.acknowledged:
        record.acknowledged = True
        record.acknowledged_at = datetime.now(timezone.utc)
        record.acknowledged_by = acknowledged_by
        session.commit()
    return True


def resolve_alert(
    session: Session, alert_id: str, resolved_by: Optional[str] = "Operator"
) -> bool:
    """Mark an alert as resolved in the database with UTC resolution timestamp (idempotent)."""
    record = session.get(AlertRecord, alert_id)
    if not record:
        return False

    now = datetime.now(timezone.utc)
    record.is_resolved = True
    record.resolved_at = now
    record.resolved_by = resolved_by
    if not record.acknowledged:
        record.acknowledged = True
        record.acknowledged_at = now
        record.acknowledged_by = resolved_by

    session.commit()
    return True


def get_alerts_filtered(
    session: Session,
    track_id: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
) -> Tuple[List[Alert], int, int, int, int]:
    """Retrieve filtered alerts and breakdown counts from PostgreSQL."""
    # 1. Base query for counts
    base_stmt = select(AlertRecord)
    if track_id:
        base_stmt = base_stmt.where(AlertRecord.track_segment_id == track_id)

    all_matching = list(session.scalars(base_stmt).all())
    total = len(all_matching)
    active_count = len([a for a in all_matching if not a.is_resolved and not a.acknowledged])
    ack_count = len([a for a in all_matching if not a.is_resolved and a.acknowledged])
    res_count = len([a for a in all_matching if a.is_resolved])

    # 2. Filtered list query
    stmt = select(AlertRecord)
    if track_id:
        stmt = stmt.where(AlertRecord.track_segment_id == track_id)

    if severity:
        stmt = stmt.where(AlertRecord.severity == severity.upper())

    if status:
        st_upper = status.upper()
        if st_upper == "ACTIVE":
            stmt = stmt.where(AlertRecord.is_resolved.is_(False), AlertRecord.acknowledged.is_(False))
        elif st_upper == "ACKNOWLEDGED":
            stmt = stmt.where(AlertRecord.is_resolved.is_(False), AlertRecord.acknowledged.is_(True))
        elif st_upper == "RESOLVED":
            stmt = stmt.where(AlertRecord.is_resolved.is_(True))

    if search:
        search_pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AlertRecord.title.ilike(search_pattern),
                AlertRecord.description.ilike(search_pattern),
                AlertRecord.track_segment_id.ilike(search_pattern),
                AlertRecord.metric.ilike(search_pattern),
            )
        )

    stmt = stmt.order_by(AlertRecord.timestamp.desc()).limit(limit)
    rows = session.scalars(stmt).all()

    alert_items = [
        Alert(
            id=r.id,
            track_segment_id=r.track_segment_id,
            severity=r.severity,
            title=r.title,
            description=r.description,
            metric=r.metric,
            value=r.value,
            threshold=r.threshold,
            timestamp=r.timestamp,
            acknowledged=r.acknowledged,
            acknowledged_at=r.acknowledged_at,
            acknowledged_by=r.acknowledged_by,
            is_resolved=r.is_resolved,
            resolved_at=r.resolved_at,
            resolved_by=r.resolved_by,
            is_simulated=r.is_simulated,
            data_source=r.data_source,
        )
        for r in rows
    ]

    return alert_items, total, active_count, ack_count, res_count


def get_recent_alerts_for_hydration(
    session: Session, limit: int = 100, severity: Optional[str] = None
) -> List[Alert]:
    """Retrieve recent alerts for buffer hydration and API queries."""
    stmt = select(AlertRecord)
    if severity:
        stmt = stmt.where(AlertRecord.severity == severity.upper())

    stmt = stmt.order_by(AlertRecord.timestamp.desc()).limit(limit)
    rows = session.scalars(stmt).all()

    return [
        Alert(
            id=r.id,
            track_segment_id=r.track_segment_id,
            severity=r.severity,
            title=r.title,
            description=r.description,
            metric=r.metric,
            value=r.value,
            threshold=r.threshold,
            timestamp=r.timestamp,
            acknowledged=r.acknowledged,
            acknowledged_at=r.acknowledged_at,
            acknowledged_by=r.acknowledged_by,
            is_resolved=r.is_resolved,
            resolved_at=r.resolved_at,
            resolved_by=r.resolved_by,
            is_simulated=r.is_simulated,
            data_source=r.data_source,
        )
        for r in rows
    ]
