"""climate — wet-bulb p99, free-cooling hours, cooling degree days.

Sources:
  - NOAA NCEI hourly observations + normals (1991-2020)
  - ASHRAE TMY (Typical Meteorological Year) for free-cooling hours
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    """Score climate suitability for datacenter cooling efficiency.
    
    For Phase 2, uses geographic proxy scoring:
    - Northern US (lat > 42°) = excellent cooling (less cooling load)
    - Pacific Northwest (lat 45-48°, lon < -120) = optimal (cool + wet-bulb low)
    - Mid-Atlantic (lat 38-42°) = good
    - Southern/Southwest (lat < 35°) = poor (high cooling degree days)
    
    Returns score [0-1] where 1.0 = excellent climate, 0.0 = poor
    """
    try:
        lat = float(site.lat)
        lon = float(site.lon)
        
        # Latitude-based climate scoring
        # Cooler = better for datacenter cooling
        if lat > 42:
            lat_score = 0.9  # Far north: very cool
        elif 38 <= lat <= 42:
            lat_score = 0.8  # Mid-north: good cooling
        elif 32 <= lat < 38:
            lat_score = 0.5  # Mid-south: moderate cooling load
        else:
            lat_score = 0.2  # South/Southwest: high cooling load
        
        # Longitude/geography bonus
        # Pacific Northwest optimal (cool + low humidity)
        if -125 <= lon <= -115 and 45 <= lat <= 49:
            geo_bonus = 0.15
        # Great Lakes region (cool + water cooling opportunity)
        elif -85 <= lon <= -75 and 40 <= lat <= 46:
            geo_bonus = 0.10
        # High elevation (general cooling benefit)
        elif lon < -105:  # Mountain states proxy
            geo_bonus = 0.05
        else:
            geo_bonus = 0.0
        
        # Combine
        combined_score = min(1.0, lat_score + geo_bonus)
        
        return FactorResult(
            sub_score=combined_score,
            kill=False,
            provenance={
                "source": "Geographic proxy (lat/lon zones)",
                "method": "Phase 2 latitude-based climate assessment",
                "lat_score": round(lat_score, 3),
                "geo_bonus": round(geo_bonus, 3),
                "note": "Real data (NOAA, ASHRAE) coming in Phase 3",
            },
        )
    except (ValueError, AttributeError, TypeError):
        return stub_result("climate", "Geographic proxy", note="Invalid site data")
