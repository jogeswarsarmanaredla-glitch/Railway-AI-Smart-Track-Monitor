"""Track segments and individual analytics endpoints."""
from typing import List
from fastapi import APIRouter, HTTPException

from app.core.database import SessionLocal
from app.repositories.track_repo import get_track_analytics, list_tracks
from app.schemas.track import TrackAnalyticsResponse, TrackSegmentSchema

router = APIRouter(prefix="/tracks", tags=["Tracks"])


@router.get("", response_model=List[TrackSegmentSchema])
def get_track_segments():
    """List all monitored railway track segments with operational parameters."""
    with SessionLocal() as session:
        return list_tracks(session)


@router.get("/{track_id}/analytics", response_model=TrackAnalyticsResponse)
def get_track_segment_analytics(track_id: str):
    """Retrieve detailed analytical aggregations and health statistics for an individual track."""
    with SessionLocal() as session:
        analytics = get_track_analytics(session, track_id=track_id)
        if not analytics:
            raise HTTPException(
                status_code=404,
                detail=f"Track segment '{track_id}' not found in database.",
            )
        return analytics
