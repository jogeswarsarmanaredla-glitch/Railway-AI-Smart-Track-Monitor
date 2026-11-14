"""Railway track segment definitions and static configuration."""
from typing import Dict


class RailwayTrackConfig:
    def __init__(
        self,
        segment_id: str,
        name: str,
        base_speed: float,
        base_temp: float,
        base_humidity: float,
        base_vx: float,
        base_vy: float,
        base_vz: float,
    ):
        self.segment_id = segment_id
        self.name = name
        self.base_speed = base_speed
        self.base_temp = base_temp
        self.base_humidity = base_humidity
        self.base_vx = base_vx
        self.base_vy = base_vy
        self.base_vz = base_vz


TRACK_DEFINITIONS: Dict[str, RailwayTrackConfig] = {
    "TRK-01": RailwayTrackConfig(
        segment_id="TRK-01",
        name="North Corridor Line 1 (Express)",
        base_speed=130.0,
        base_temp=31.5,
        base_humidity=52.0,
        base_vx=0.14,
        base_vy=0.08,
        base_vz=0.22,
    ),
    "TRK-02": RailwayTrackConfig(
        segment_id="TRK-02",
        name="East Freight Loop (Heavy Axle)",
        base_speed=75.0,
        base_temp=33.0,
        base_humidity=56.0,
        base_vx=0.18,
        base_vy=0.11,
        base_vz=0.32,
    ),
    "TRK-03": RailwayTrackConfig(
        segment_id="TRK-03",
        name="Mountain Pass Section (Curved)",
        base_speed=60.0,
        base_temp=24.0,
        base_humidity=65.0,
        base_vx=0.22,
        base_vy=0.09,
        base_vz=0.25,
    ),
    "TRK-04": RailwayTrackConfig(
        segment_id="TRK-04",
        name="South Coastal Transit Line",
        base_speed=95.0,
        base_temp=35.0,
        base_humidity=78.0,
        base_vx=0.15,
        base_vy=0.07,
        base_vz=0.20,
    ),
}

PROFILES = ["nominal", "corrugation", "impact_defect", "thermal_stress"]
