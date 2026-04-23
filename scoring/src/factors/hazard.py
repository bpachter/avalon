"""hazard — flood, seismic, wildfire, hurricane, tornado risk.

Sources:
  - FEMA NFHL (floodplains)
  - USGS National Seismic Hazard Map (PGA)
  - USFS Wildfire Hazard Potential
  - NOAA SPC tornado climatology
  - NOAA NHC hurricane wind zones
"""
from __future__ import annotations

import math

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    """Score hazard risk based on geographic location and regional risk zones.
    
    For Phase 2, uses geographic proxy scoring:
    - High latitude (> 40°) = higher tornado/hail risk (less desirable)
    - Low latitude (< 30°) = higher hurricane risk (less desirable)
    - Mid-latitude zones (30-40°) = optimal hazard profile (more desirable)
    - Applies west coast penalty for earthquake/wildfire (lon < -120)
    
    Returns score [0-1] where 1.0 = excellent hazard profile, 0.0 = poor
    """
    try:
        lat = float(site.lat)
        lon = float(site.lon)
        
        # Start with neutral score
        base_score = 0.5
        
        # Latitude-based hazard assessment
        # Optimal zone: 30-40°N (mid-Atlantic to Mid-South)
        if 30 <= lat <= 40:
            lat_score = 0.8  # Good zone
        elif 25 <= lat < 30:
            lat_score = 0.6  # Hurricane risk zone (southern US)
        elif 40 < lat <= 48:
            lat_score = 0.5  # Tornado/hail risk zone (northern US)
        else:
            lat_score = 0.3  # Extreme risk zones
        
        # Longitude-based hazard assessment
        # West coast penalty for earthquake/wildfire
        if lon < -120:
            lon_score = 0.4  # Pacific coast: earthquake, wildfire, tsunami
        elif -120 <= lon <= -95:
            lon_score = 0.7  # Good interior zone
        else:
            lon_score = 0.6  # Eastern US
        
        # Combine: average with slight latitude preference
        combined_score = (lat_score * 0.6) + (lon_score * 0.4)
        
        # Normalize to [0-1]
        final_score = min(1.0, max(0.0, combined_score))
        
        return FactorResult(
            sub_score=final_score,
            kill=False,
            provenance={
                "source": "Geographic proxy (lat/lon zones)",
                "method": "Phase 2 geographic risk zones",
                "lat_score": round(lat_score, 3),
                "lon_score": round(lon_score, 3),
                "note": "Real data (FEMA, USGS, NOAA) coming in Phase 3",
            },
        )
    except (ValueError, AttributeError, TypeError):
        return stub_result("hazard", "Geographic proxy", note="Invalid site data")
