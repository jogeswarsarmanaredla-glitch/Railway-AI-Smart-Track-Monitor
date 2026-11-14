"""Simulator runtime control endpoints."""
import asyncio
from fastapi import APIRouter, HTTPException
from app.schemas.simulator import SimulatorControlRequest, SimulatorStatus
from app.services.simulator import simulator_service

router = APIRouter(prefix="/simulator", tags=["Simulator"])


@router.get("/status", response_model=SimulatorStatus)
def get_simulator_status():
    """Get current status of the telemetry simulator."""
    return simulator_service.get_status()


@router.post("/control", response_model=SimulatorStatus)
async def control_simulator(request: SimulatorControlRequest):
    """Control the synthetic simulator: start, stop, toggle, step, set_profile, or reset."""
    action = request.action.lower()

    if action == "start":
        await simulator_service.start_background_loop()
    elif action == "stop":
        await simulator_service.stop_background_loop()
    elif action == "toggle":
        if simulator_service._is_running:
            await simulator_service.stop_background_loop()
        else:
            await simulator_service.start_background_loop()
    elif action == "step":
        await asyncio.to_thread(simulator_service.step)
    elif action == "reset":
        await asyncio.to_thread(simulator_service.reset)
    elif action == "set_profile":
        if not request.profile:
            raise HTTPException(status_code=400, detail="Missing 'profile' in request")
        if not simulator_service.set_profile(request.profile):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid profile '{request.profile}'. Available: {simulator_service.get_status().available_profiles}",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{request.action}'. Allowed: start, stop, toggle, step, reset, set_profile",
        )

    if request.profile and action != "set_profile":
        simulator_service.set_profile(request.profile)

    if request.interval_seconds is not None:
        simulator_service.set_interval(request.interval_seconds)

    return simulator_service.get_status()


@router.post("/reset", response_model=SimulatorStatus)
def reset_simulator():
    """Reset simulator buffers, active profile, and rehydrate state."""
    simulator_service.reset()
    return simulator_service.get_status()

