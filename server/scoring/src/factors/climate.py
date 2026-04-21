"""climate — wet-bulb p99, free-cooling hours, cooling degree days.

Sources:
  - NOAA NCEI hourly observations + normals (1991-2020)
  - ASHRAE TMY (Typical Meteorological Year) for free-cooling hours
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("climate", "NOAA NCEI + ASHRAE TMY")
