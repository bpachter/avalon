"""water — surface + reclaimed water availability, aquifer stress, drought trend.

Sources:
  - USGS NWIS (real-time + historical streamgages)
  - NOAA Drought Monitor (5-yr trend)
  - EPA WaterSense
  - State water-rights databases (TX TCEQ, AZ ADWR, NV NDWR, CA SWRCB, etc.)
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("water", "USGS NWIS + NOAA Drought Monitor")
