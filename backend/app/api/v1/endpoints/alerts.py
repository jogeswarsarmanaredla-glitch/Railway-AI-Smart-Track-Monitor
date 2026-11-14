"""Alerts management endpoints."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query
from app.core.database import SessionLocal
from app.repositories.alert_repo import get_alerts_filtered
from app.schemas.alert import AlertListResponse
from app.services.simulator import simulator_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=AlertListResponse)
def get_alerts(
    severity: Optional[str] = Query(None, description="Filter by severity: LOW, MEDIUM, HIGH, CRITICAL"),
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, ACKNOWLEDGED, RESOLVED, ALL"),
    track_id: Optional[str] = Query(None, description="Filter by track code (e.g. TRK-01)"),
    search: Optional[str] = Query(None, description="Text search on alert title, metric, or description"),
    limit: int = Query(100, ge=1, le=500, description="Max alerts to return"),
):
    """List railway issue alerts with multi-criteria filtering from PostgreSQL."""
    try:
        with SessionLocal() as session:
            alerts, total, active, ack, res = get_alerts_filtered(
                session=session,
                track_id=track_id,
                status=status,
                severity=severity,
                search=search,
                limit=limit,
            )
            return AlertListResponse(
                total=total,
                active_count=active,
                acknowledged_count=ack,
                resolved_count=res,
                data_source="POSTGRESQL_PERSISTENT_STORAGE",
                is_simulated=True,
                alerts=alerts,
            )
    except Exception:
        # Fallback to in-memory queue if database session fails
        mem_alerts = simulator_service.get_alerts(severity=severity)
        if track_id:
            mem_alerts = [a for a in mem_alerts if a.track_segment_id == track_id]
        if status:
            st = status.upper()
            if st == "ACTIVE":
                mem_alerts = [a for a in mem_alerts if not getattr(a, "is_resolved", False) and not a.acknowledged]
            elif st == "ACKNOWLEDGED":
                mem_alerts = [a for a in mem_alerts if not getattr(a, "is_resolved", False) and a.acknowledged]
            elif st == "RESOLVED":
                mem_alerts = [a for a in mem_alerts if getattr(a, "is_resolved", False)]
        if search:
            pat = search.lower()
            mem_alerts = [a for a in mem_alerts if pat in a.title.lower() or pat in a.description.lower()]

        active = len([a for a in mem_alerts if not getattr(a, "is_resolved", False) and not a.acknowledged])
        ack = len([a for a in mem_alerts if not getattr(a, "is_resolved", False) and a.acknowledged])
        res = len([a for a in mem_alerts if getattr(a, "is_resolved", False)])

        return AlertListResponse(
            total=len(mem_alerts),
            active_count=active,
            acknowledged_count=ack,
            resolved_count=res,
            data_source="SYNTHETIC_SIMULATION_ENGINE",
            is_simulated=True,
            alerts=mem_alerts[:limit],
        )


@router.patch("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    """Acknowledge an active issue alert with UTC timestamp (idempotent)."""
    success = simulator_service.acknowledge_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Alert with id {alert_id} not found")
    return {"status": "success", "alert_id": alert_id, "acknowledged": True}


@router.patch("/{alert_id}/resolve")
def resolve_alert(alert_id: str, payload: Optional[Dict[str, Any]] = None):
    """Mark an issue alert as resolved with UTC timestamp (idempotent)."""
    resolved_by = "Operator"
    if payload and isinstance(payload, dict):
        resolved_by = payload.get("resolved_by", "Operator")
    success = simulator_service.resolve_alert(alert_id, resolved_by=resolved_by)
    if not success:
        raise HTTPException(status_code=404, detail=f"Alert with id {alert_id} not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "success",
        "alert_id": alert_id,
        "resolved": True,
        "is_resolved": True,
        "acknowledged": True,
        "resolved_by": resolved_by,
        "resolved_at": now_iso,
    }
