"""land_zoning — parcel size adequacy, allowed-use match, brownfield, slope.

Sources:
  - County parcel/zoning GIS (per-county registry in src/ingest/county_gis.py)
  - EPA Brownfields
  - USGS 3DEP Digital Elevation Model
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("land_zoning", "County GIS + EPA Brownfields + USGS 3DEP")
