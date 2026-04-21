"""County GIS registry — per-county parcel/zoning endpoints.

Each county exposes parcel + zoning data differently. Maintain a
declarative registry here, keyed by FIPS code, that the land_zoning
factor can call uniformly.

Initial focus: counties that already host hyperscaler builds.
"""
from __future__ import annotations

# fips -> {"name": str, "state": str, "parcel_url": str, "zoning_url": str, "format": str}
COUNTY_REGISTRY: dict[str, dict] = {
    # TODO: populate from authoritative state aggregators where they exist
    # (e.g., TX TNRIS Stratmap, VA VGIN, GA GeorgiaView)
}


def parcel_at(lat: float, lon: float) -> dict | None:
    return None
