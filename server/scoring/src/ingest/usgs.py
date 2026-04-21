"""USGS — water (NWIS), elevation (3DEP), seismic hazard."""
from __future__ import annotations


def streamgages_within_radius(lat: float, lon: float, miles: float) -> list[dict]:
    return []


def seismic_pga_2pct_50yr(lat: float, lon: float) -> float | None:
    return None


def slope_pct(lat: float, lon: float, radius_m: float = 200.0) -> float | None:
    return None
