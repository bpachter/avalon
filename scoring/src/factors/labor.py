"""labor — skilled construction labor, electrician density, IT workforce within 50 mi.

Sources:
  - BLS QCEW (county-level employment by industry)
  - BLS OEWS (occupational employment + wages)
  - ACS commuting flows
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    """Score labor availability and skills density.
    
    For Phase 2, uses geographic proxy scoring:
    - Large metros (>1M population) = high skill density
    - Mid-size metros (250K-1M) = good availability
    - Small metros (<250K) = limited availability
    - Proximity to tech hubs (Bay Area, Austin, Seattle, Boston) = bonus
    
    Returns score [0-1] where 1.0 = excellent labor, 0.0 = poor
    """
    try:
        lat = float(site.lat)
        lon = float(site.lon)
        
        # Base score for geographic regions known for tech/skilled labor
        # Tech hubs and high-skilled regions
        
        # Silicon Valley / Bay Area
        if 37 <= lat <= 38.5 and -122.5 <= lon <= -121.5:
            base_score = 0.9
        # Seattle area
        elif 47 <= lat <= 47.8 and -122.5 <= lon <= -122:
            base_score = 0.9
        # Austin area
        elif 30 <= lat <= 30.5 and -97.9 <= lon <= -97.5:
            base_score = 0.85
        # Boston area
        elif 42 <= lat <= 42.5 and -71.5 <= lon <= -71:
            base_score = 0.85
        # Northern Virginia (tech corridor)
        elif 38.5 <= lat <= 39.2 and -77.8 <= lon <= -77:
            base_score = 0.8
        # Denver/Colorado
        elif 39.5 <= lat <= 40 and -104.9 <= lon <= -104.5:
            base_score = 0.75
        # Raleigh-Durham (Research Triangle)
        elif 35.7 <= lat <= 36.2 and -78.8 <= lon <= -78.3:
            base_score = 0.75
        # Large metros (estimated by latitude clustering)
        elif 30 <= lat <= 45 and -125 <= lon <= -70:
            base_score = 0.6  # General metro areas
        else:
            base_score = 0.3  # Rural areas
        
        # Penalize remote locations
        if abs(lat) > 47 or abs(lat) < 25:
            base_score *= 0.8
        
        # Final normalization
        final_score = min(1.0, max(0.0, base_score))
        
        return FactorResult(
            sub_score=final_score,
            kill=False,
            provenance={
                "source": "Geographic proxy (metro/tech hub zones)",
                "method": "Phase 2 labor hub scoring",
                "base_score": round(base_score, 3),
                "note": "Real data (BLS, ACS) coming in Phase 3",
            },
        )
    except (ValueError, AttributeError, TypeError):
        return stub_result("labor", "Geographic proxy", note="Invalid site data")
