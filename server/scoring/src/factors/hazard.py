"""hazard — flood, seismic, wildfire, hurricane, tornado risk.

Sources:
  - FEMA NFHL (floodplains)
  - USGS National Seismic Hazard Map (PGA)
  - USFS Wildfire Hazard Potential
  - NOAA SPC tornado climatology
  - NOAA NHC hurricane wind zones
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("hazard", "FEMA NFHL + USGS + USFS + NOAA")
