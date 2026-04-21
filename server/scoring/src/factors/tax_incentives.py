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
from ..reference_data import STATE_DC_TAX_INCENTIVE_PROVENANCE, STATE_DC_TAX_INCENTIVE_SCORE


def score(site) -> FactorResult:
    state = (site.extras.get("state") or "").upper().strip()
    if not state:
        return stub_result("tax_incentives", "State commerce depts + IRS OZ", note="site.extras.state missing")
    score_val = STATE_DC_TAX_INCENTIVE_SCORE.get(state)
    if score_val is None:
        return stub_result("tax_incentives", "State commerce depts + IRS OZ", note=f"no incentive rank for {state!r}")
    return FactorResult(
        sub_score=float(score_val),
        provenance={
            "source": STATE_DC_TAX_INCENTIVE_PROVENANCE["source"],
            "state": state,
            "score": float(score_val),
            "scale": STATE_DC_TAX_INCENTIVE_PROVENANCE["scale"],
            "as_of": STATE_DC_TAX_INCENTIVE_PROVENANCE["as_of"],
        },
    )
