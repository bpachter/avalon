"""tax_incentives — sales/use exemptions, property tax abatements, opportunity zones.

Sources:
  - State commerce department incentive registries
  - IRS Opportunity Zone shapefile
  - State revenue dept tax codes (sales/use exemption on DC equipment)

Notable as of 2025: VA, TX, OH, IA, MS, NV, AZ, GA, IL, NC have explicit
data-center sales/use exemptions with varying minimum-investment and
job-creation thresholds.
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("tax_incentives", "State commerce depts + IRS OZ")
