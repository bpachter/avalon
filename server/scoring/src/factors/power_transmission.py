"""power_transmission — distance to ≥230 kV transmission + substation headroom + cost estimates.

Sources:
  - HIFLD Electric Power Transmission Lines (filter VOLTAGE >= 230)
  - HIFLD Electric Substations

Sub-score (piecewise on distance to nearest ≥230 kV line):
   0 mi  -> 1.00
   1 mi  -> 0.95
   5 mi  -> 0.75
  15 mi  -> 0.30
  30 mi  -> 0.00

Kill criterion: no ≥230 kV line within 15 miles.

Provenance enrichment (when cache available):
  - Nearest line voltage (kV), owner, volt class
  - Nearest substation name, distance, max voltage, # lines
  - Estimated tap line cost ($/mile × distance, indexed to voltage class)
  - Estimated new substation greenfield cost
  - Substation headroom proxy score
"""
from __future__ import annotations

from ..geo import haversine_mi
from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.75), (15.0, 0.30), (30.0, 0.0)]

# Tap line construction cost estimates (2024 USD, overhead single-circuit)
# Source: FERC/Brattle Group interconnection cost benchmarks
_TAP_COST_PER_MILE: dict[str, float] = {
    "115kV":  900_000,
    "138kV":  950_000,
    "230kV": 1_400_000,
    "345kV": 2_100_000,
    "500kV": 3_200_000,
    "765kV": 4_800_000,
}

# Greenfield substation cost estimates (2024 USD) — includes switchgear, land, civil
_SUBSTATION_GREENFIELD_COST: dict[str, float] = {
    "115kV":   8_000_000,
    "138kV":  10_000_000,
    "230kV":  18_000_000,
    "345kV":  28_000_000,
    "500kV":  45_000_000,
    "765kV":  70_000_000,
}


def _voltage_class(kv: float | None) -> str:
    if kv is None:
        return "230kV"
    if kv >= 700:
        return "765kV"
    if kv >= 450:
        return "500kV"
    if kv >= 300:
        return "345kV"
    if kv >= 200:
        return "230kV"
    if kv >= 125:
        return "138kV"
    return "115kV"


def _to_float(v) -> float | None:
    try:
        return float(v)
    except Exception:
        return None


def _to_int(v) -> int | None:
    try:
        return int(float(v))
    except Exception:
        return None


def _score_substation_headroom(site) -> tuple[float, dict] | None:
    """Substation headroom proxy based on nearest HIFLD substation attributes."""
    subs = hifld.substations()
    if not subs:
        return None

    best: tuple[float, float, float, dict] | None = None
    for lat, lon, props in subs:
        d = haversine_mi(site.lat, site.lon, lat, lon)
        if best is None or d < best[0]:
            best = (d, lat, lon, props)
    if best is None:
        return None

    dist_mi, _lat, _lon, props = best
    max_volt = _to_float(props.get("MAX_VOLT"))
    lines = _to_int(props.get("LINES"))

    if max_volt is None:
        voltage_score = 0.45
    else:
        voltage_score = piecewise(max_volt, [(115.0, 0.25), (230.0, 0.65), (345.0, 0.85), (500.0, 1.0)])

    if lines is None:
        lines_score = 0.40
    else:
        lines_score = max(0.0, min(1.0, lines / 10.0))

    distance_penalty = piecewise(dist_mi, [(0.0, 1.0), (5.0, 0.9), (15.0, 0.65), (25.0, 0.35), (50.0, 0.0)])
    headroom = (0.7 * voltage_score + 0.3 * lines_score) * distance_penalty

    return headroom, {
        "nearest_substation_mi": round(dist_mi, 3),
        "nearest_substation_name": props.get("NAME"),
        "nearest_substation_max_volt_kv": max_volt,
        "nearest_substation_lines": lines,
        "nearest_substation_county": props.get("COUNTY"),
        "nearest_substation_state": props.get("STATE"),
        "substation_headroom_proxy": round(headroom, 4),
    }


def score(site) -> FactorResult:
    idx = hifld.transmission_index()
    if idx is None or not idx.points:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")

    nearest = idx.nearest_with_properties(site.lat, site.lon)
    if nearest is None:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")

    dist_mi, line_props = nearest
    line_sub = piecewise(dist_mi, _DIST_ANCHORS)

    # Voltage enrichment
    voltage_kv = _to_float(line_props.get("VOLTAGE"))
    volt_class_tag = line_props.get("VOLT_CLASS") or _voltage_class(voltage_kv)
    line_owner = line_props.get("OWNER") or "Unknown"
    line_type = line_props.get("TYPE") or "Unknown"
    sub_1 = line_props.get("SUB_1") or None
    sub_2 = line_props.get("SUB_2") or None

    v_class = _voltage_class(voltage_kv)
    tap_cost_per_mi = _TAP_COST_PER_MILE[v_class]
    sub_cost = _SUBSTATION_GREENFIELD_COST[v_class]

    tap_line_est_low = dist_mi * tap_cost_per_mi * 0.8
    tap_line_est_high = dist_mi * tap_cost_per_mi * 1.4
    total_interconnect_est_low = tap_line_est_low + sub_cost * 0.6
    total_interconnect_est_high = tap_line_est_high + sub_cost * 1.2

    # Substation headroom
    headroom_opt = _score_substation_headroom(site)
    if headroom_opt is None:
        sub = line_sub
        headroom_prov: dict = {
            "substation_headroom_proxy": None,
            "substation_note": "HIFLD substations cache unavailable; scored on transmission distance only",
        }
    else:
        headroom_sub, headroom_prov = headroom_opt
        sub = 0.8 * line_sub + 0.2 * headroom_sub

    kill = dist_mi > 15.0

    return FactorResult(
        sub_score=sub,
        kill=kill,
        provenance={
            "source": "HIFLD Transmission Lines (≥230 kV)",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
            "line_distance_sub_score": round(line_sub, 4),
            "kill_threshold_mi": 15.0,
            "nearest_line_voltage_kv": voltage_kv,
            "nearest_line_volt_class": volt_class_tag,
            "nearest_line_owner": line_owner,
            "nearest_line_type": line_type,
            "nearest_line_sub_1": sub_1,
            "nearest_line_sub_2": sub_2,
            "voltage_class_used": v_class,
            "tap_cost_per_mile_usd": int(tap_cost_per_mi),
            "tap_line_cost_est_low_usd": int(tap_line_est_low),
            "tap_line_cost_est_high_usd": int(tap_line_est_high),
            "new_substation_greenfield_cost_usd": int(sub_cost),
            "total_interconnect_est_low_usd": int(total_interconnect_est_low),
            "total_interconnect_est_high_usd": int(total_interconnect_est_high),
            **headroom_prov,
        },
    )

