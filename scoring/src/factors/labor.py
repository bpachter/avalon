"""labor — skilled construction labor, electrician density, IT workforce within 50 mi.

Sources:
  - BLS QCEW (county-level employment by industry)
  - BLS OEWS (occupational employment + wages)
  - ACS commuting flows
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("labor", "BLS QCEW + OEWS + ACS")
