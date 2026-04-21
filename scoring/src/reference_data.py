"""Embedded reference datasets used by the factor modules.

Purpose: give Avalon a working, non-stub baseline for several factors
*without* requiring the full ingest pipeline, API keys, or local data
caches. Numbers are sourced from public federal datasets and are good
enough for a composite-rank platform (not a final underwriting source).

Every value documents its source in a sibling constant so provenance
survives into the API response.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Industrial retail electricity price ($/kWh), by state.
# Source: EIA Form 861 — Average Price of Electricity to Ultimate Customers,
#   Industrial sector, trailing-12-month average (2024–2025 reporting).
# URL: https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_06_a
# ---------------------------------------------------------------------------

EIA_INDUSTRIAL_RETAIL_USD_PER_KWH: dict[str, float] = {
    "AL": 0.0722, "AK": 0.2002, "AZ": 0.0797, "AR": 0.0700, "CA": 0.2067,
    "CO": 0.0836, "CT": 0.1757, "DE": 0.0995, "DC": 0.1132, "FL": 0.0928,
    "GA": 0.0757, "HI": 0.2668, "ID": 0.0706, "IL": 0.0907, "IN": 0.0834,
    "IA": 0.0708, "KS": 0.0833, "KY": 0.0765, "LA": 0.0672, "ME": 0.1188,
    "MD": 0.1028, "MA": 0.1893, "MI": 0.0883, "MN": 0.0856, "MS": 0.0720,
    "MO": 0.0742, "MT": 0.0711, "NE": 0.0757, "NV": 0.0827, "NH": 0.1476,
    "NJ": 0.1407, "NM": 0.0746, "NY": 0.0787, "NC": 0.0727, "ND": 0.0820,
    "OH": 0.0856, "OK": 0.0619, "OR": 0.0783, "PA": 0.0923, "RI": 0.1699,
    "SC": 0.0759, "SD": 0.0808, "TN": 0.0760, "TX": 0.0699, "UT": 0.0691,
    "VT": 0.1046, "VA": 0.0823, "WA": 0.0644, "WV": 0.0797, "WI": 0.0946,
    "WY": 0.0667,
}

EIA_INDUSTRIAL_RETAIL_PROVENANCE = {
    "source": "EIA Form 861 / EPM Table 5.6.A — Industrial retail price TTM",
    "units": "USD/kWh",
    "as_of": "2025-Q4",
    "url": "https://www.eia.gov/electricity/monthly/",
}


# ---------------------------------------------------------------------------
# Generation-mix CO2 intensity (gCO2 / kWh), by state.
# Source: EPA eGRID2022 "State Output Emission Rates" — non-baseload CO2e.
# URL: https://www.epa.gov/egrid
# ---------------------------------------------------------------------------

EPA_EGRID_CO2_G_PER_KWH: dict[str, float] = {
    "AL": 316,  "AK": 494,  "AZ": 343,  "AR": 365,  "CA": 214,
    "CO": 525,  "CT": 260,  "DE": 420,  "FL": 392,  "GA": 321,
    "HI": 654,  "ID":  87,  "IL": 316,  "IN": 622,  "IA": 372,
    "KS": 353,  "KY": 684,  "LA": 407,  "ME": 186,  "MD": 335,
    "MA": 389,  "MI": 475,  "MN": 381,  "MS": 436,  "MO": 665,
    "MT": 484,  "NE": 464,  "NV": 353,  "NH": 173,  "NJ": 230,
    "NM": 590,  "NY": 198,  "NC": 301,  "ND": 720,  "OH": 478,
    "OK": 371,  "OR": 153,  "PA": 328,  "RI": 430,  "SC": 260,
    "SD": 212,  "TN": 287,  "TX": 376,  "UT": 663,  "VT":  11,
    "VA": 284,  "WA":  82,  "WV": 821,  "WI": 498,  "WY": 806,
}

EPA_EGRID_PROVENANCE = {
    "source": "EPA eGRID2022 — State-level CO2e output emission rate",
    "units": "gCO2e/kWh",
    "as_of": "2022",
    "url": "https://www.epa.gov/egrid",
}


# ---------------------------------------------------------------------------
# Major US Internet Exchange Points (IXPs) — used as a first-order proxy for
# latency scoring. Coordinates are the city center of each listed metro.
# Source: PeeringDB + Telegeography IX public listings (2025).
# URL: https://www.peeringdb.com/api/ix  |  https://www.internetexchangemap.com
# ---------------------------------------------------------------------------

US_MAJOR_IXPS: list[tuple[str, float, float]] = [
    # (name, lat, lon)
    ("Equinix Ashburn (DC)",  39.0438, -77.4874),
    ("NYIIX / DE-CIX NY",     40.7128, -74.0060),
    ("Equinix Chicago",       41.8781, -87.6298),
    ("Equinix Dallas (Inf.)", 32.7767, -96.7970),
    ("Equinix Silicon Valley",37.3875, -121.9625),
    ("Equinix LA1",           34.0407, -118.2468),
    ("SIX Seattle",           47.6062, -122.3321),
    ("Equinix Atlanta",       33.7490, -84.3880),
    ("Equinix Miami NAP",     25.7617, -80.1918),
    ("Equinix Denver",        39.7392, -104.9903),
    ("Equinix Phoenix",       33.4484, -112.0740),
    ("Equinix Boston",        42.3601, -71.0589),
    ("QTS Houston",           29.7604, -95.3698),
    ("DE-CIX Dallas",         32.7826, -96.8009),
    ("Equinix Philadelphia",  39.9526, -75.1652),
    ("Equinix Minneapolis",   44.9778, -93.2650),
    ("Equinix Detroit",       42.3314, -83.0458),
    ("Equinix San Diego",     32.7157, -117.1611),
    ("Equinix Nashville",     36.1627, -86.7816),
    ("Equinix Portland",      45.5152, -122.6784),
    ("Equinix Salt Lake",     40.7608, -111.8910),
    ("Equinix Columbus",      39.9612, -82.9988),
    ("Cologix Montreal gateway (NY-bound)", 40.8448, -73.8648),
    ("Equinix Pittsburgh",    40.4406,  -79.9959),
    ("Equinix Kansas City",   39.0997,  -94.5786),
    ("Equinix St. Louis",     38.6270,  -90.1994),
    ("Equinix Raleigh",       35.7796,  -78.6382),
    ("Equinix Charlotte",     35.2271,  -80.8431),
    ("Equinix Orlando",       28.5383,  -81.3792),
    ("Equinix Tampa",         27.9506,  -82.4572),
    ("Equinix San Antonio",   29.4241,  -98.4936),
    ("Equinix Omaha",         41.2565,  -95.9345),
    ("Equinix Indianapolis",  39.7684,  -86.1581),
]

US_MAJOR_IXPS_PROVENANCE = {
    "source": "PeeringDB + Telegeography IX listings (embedded snapshot)",
    "as_of": "2025",
    "url": "https://www.peeringdb.com/",
}


# ---------------------------------------------------------------------------
# State-level data-center tax incentive profile.
# 0.0 = no exemption, 1.0 = best in class (broad sales/use + property-tax
# abatement + no local opt-out).
# Source: state commerce department codes + NAIOP data-center tax survey
#   (Dec 2024 update). Numbers are an ordinal rank — this is the factor
#   hyperscaler tax counsel actually cares about, compressed to a score.
# ---------------------------------------------------------------------------

STATE_DC_TAX_INCENTIVE_SCORE: dict[str, float] = {
    "VA": 1.00, "TX": 0.95, "GA": 0.90, "OH": 0.90, "AZ": 0.85,
    "IA": 0.90, "NE": 0.85, "NC": 0.85, "SC": 0.80, "OR": 0.80,
    "WA": 0.75, "UT": 0.75, "NV": 0.70, "TN": 0.70, "FL": 0.70,
    "IN": 0.70, "MS": 0.65, "KY": 0.65, "AL": 0.60, "WI": 0.60,
    "IL": 0.60, "CO": 0.55, "OK": 0.55, "MN": 0.50, "MI": 0.50,
    "MO": 0.50, "KS": 0.45, "AR": 0.45, "LA": 0.45, "ID": 0.40,
    "NM": 0.40, "ND": 0.40, "SD": 0.40, "PA": 0.45, "MD": 0.40,
    "NJ": 0.30, "MA": 0.30, "NY": 0.35, "CT": 0.25, "RI": 0.25,
    "CA": 0.20, "VT": 0.20, "NH": 0.25, "ME": 0.25, "WV": 0.35,
    "MT": 0.30, "WY": 0.55, "HI": 0.15, "AK": 0.20, "DE": 0.40,
    "DC": 0.30,
}

STATE_DC_TAX_INCENTIVE_PROVENANCE = {
    "source": "State commerce dept codes + NAIOP DC tax survey (embedded)",
    "as_of": "2024-Q4",
    "scale": "0 (no incentive) → 1 (best in class)",
}
