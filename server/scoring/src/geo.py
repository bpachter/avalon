"""Geographic helpers — distance, H3, CRS."""
from __future__ import annotations

import math
from typing import Iterable

EARTH_R_MI = 3958.7613
EARTH_R_KM = 6371.0088


def haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in statute miles."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_MI * math.asin(math.sqrt(a))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_mi(lat1, lon1, lat2, lon2) * 1.609344


def nearest_distance_mi(
    lat: float, lon: float, points: Iterable[tuple[float, float]]
) -> float | None:
    """Min haversine distance (mi) from (lat,lon) to any point in `points`."""
    best: float | None = None
    for plat, plon in points:
        d = haversine_mi(lat, lon, plat, plon)
        if best is None or d < best:
            best = d
    return best


def to_h3(lat: float, lon: float, resolution: int = 7) -> str:
    """H3 cell at given resolution. Res 7 ≈ 5 km² hexes — good for siting screens."""
    try:
        import h3  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise ImportError("h3 not installed; pip install h3>=4.0") from e
    return h3.latlng_to_cell(lat, lon, resolution)
