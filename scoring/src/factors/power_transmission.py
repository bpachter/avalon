"""power_transmission — transmission distance + substation headroom + queue congestion.

Sources:
  - HIFLD Electric Power Transmission Lines (filter VOLTAGE >= 230)
  - HIFLD Electric Substations
  - FERC Form 715 (planning models) — TODO
    - ISO/RTO interconnection queues (live per-project ingest + cache)

Sub-score (piecewise on distance to nearest ≥230 kV line):
   0 mi  -> 1.00
   1 mi  -> 0.95
   5 mi  -> 0.75
  15 mi  -> 0.30
  30 mi  -> 0.00

Kill criterion: no ≥230 kV line within 15 miles.
"""
from __future__ import annotations

from ..geo import haversine_mi
from ..ingest import hifld, iso_queues
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.75), (15.0, 0.30), (30.0, 0.0)]


def _to_float(v) -> float | None:
    try:
        f = float(v)
        return f
    except Exception:
        return None


def _to_int(v) -> int | None:
    try:
        return int(float(v))
    except Exception:
        return None


def _score_substation_headroom(site) -> tuple[float, dict] | None:
    """Return a light-weight headroom proxy based on nearest substation attrs.

    We use fields available in HIFLD substations (MAX_VOLT, LINES) as a coarse
    indicator of nearby interconnection optionality. This is intentionally
    heuristic until ISO queue and utility-level headroom data are wired.
    """
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

    # Voltage proxy: 115kV->0.25, 230kV->0.65, 345kV->0.85, 500kV+->1.0
    if max_volt is None:
        voltage_score = 0.45
    else:
        voltage_score = piecewise(max_volt, [(115.0, 0.25), (230.0, 0.65), (345.0, 0.85), (500.0, 1.0)])

    # More connected stations generally imply more routing optionality.
    if lines is None:
        lines_score = 0.40
    else:
        lines_score = max(0.0, min(1.0, lines / 10.0))

    # Degrade quickly beyond ~25 miles from nearest substation.
    distance_penalty = piecewise(dist_mi, [(0.0, 1.0), (5.0, 0.9), (15.0, 0.65), (25.0, 0.35), (50.0, 0.0)])
    headroom = (0.7 * voltage_score + 0.3 * lines_score) * distance_penalty

    return headroom, {
        "nearest_substation_mi": round(dist_mi, 3),
        "substation_name": props.get("NAME"),
        "substation_max_volt_kv": max_volt,
        "substation_lines": lines,
        "substation_headroom_proxy": round(headroom, 4),
        "substations_cache_path": str(hifld.substations_index().geojson_path) if hifld.substations_index() else None,
    }


def _score_queue_congestion(site) -> tuple[float, dict] | None:
    """Live queue congestion signal from per-project ISO queue ingest.

    We balance two effects:
    - Optionality signal: nearby active queue MW indicates interconnection activity.
    - Congestion signal: excessive local queue MW / withdrawals indicate friction.
    """
    metrics = iso_queues.congestion_metrics(
        site.lat,
        site.lon,
        state=(site.extras.get("state") if hasattr(site, "extras") else None),
    )
    if metrics is None:
        return None

    nearest_raw = metrics.get("nearest_project_distance_mi")
    nearest_mi = float(nearest_raw) if nearest_raw is not None else 120.0
    active_100 = float(metrics.get("active_mw_100mi") or 0.0)
    pending_100 = float(metrics.get("pending_mw_100mi") or 0.0)
    withdrawn_share = float(metrics.get("withdrawn_share_100mi") or 0.0)

    # Optionality improves when there is nearby active queue infrastructure.
    near_score = piecewise(nearest_mi, [(0.0, 1.0), (25.0, 0.9), (75.0, 0.7), (150.0, 0.4), (300.0, 0.0)])
    activity_score = piecewise(active_100, [(0.0, 0.1), (500.0, 0.35), (2000.0, 0.65), (6000.0, 0.9), (12000.0, 0.75)])

    # Congestion penalty rises with pending-heavy queues and high withdrawal share.
    pending_pressure = min(1.0, pending_100 / max(active_100 + 1.0, 1.0))
    congestion_penalty = 0.6 * pending_pressure + 0.4 * withdrawn_share

    queue_score = max(0.0, min(1.0, (0.6 * near_score + 0.4 * activity_score) * (1.0 - 0.45 * congestion_penalty)))

    return queue_score, {
        "queue_source": iso_queues.provenance().get("source"),
        "queue_as_of": iso_queues.provenance().get("as_of"),
        "queue_score": round(queue_score, 4),
        "queue_pending_pressure": round(pending_pressure, 4),
        "queue_congestion_penalty": round(congestion_penalty, 4),
        **metrics,
    }


def score(site) -> FactorResult:
    idx = hifld.transmission_index()
    if idx is None or not idx.points:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")
    dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
    if dist_mi is None:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")

    line_sub = piecewise(dist_mi, _DIST_ANCHORS)
    headroom = _score_substation_headroom(site)
    queue_opt = _score_queue_congestion(site)

    if headroom is None:
        sub = line_sub
        headroom_prov = {
            "substation_headroom_proxy": None,
            "substation_note": "substation cache unavailable; scored by transmission distance only",
        }
    else:
        headroom_sub, headroom_prov = headroom
        if queue_opt is None:
            # Keep distance-to-line dominant until headroom becomes measured, not proxy.
            sub = 0.8 * line_sub + 0.2 * headroom_sub
        else:
            queue_sub, _queue_prov = queue_opt
            # Queue signal is additive but intentionally lower weight than distance.
            sub = 0.7 * line_sub + 0.2 * headroom_sub + 0.1 * queue_sub

    if queue_opt is None:
        queue_prov = {
            "queue_score": None,
            "queue_note": "queue ingest unavailable",
        }
    else:
        _queue_sub, queue_prov = queue_opt

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
            **headroom_prov,
            **queue_prov,
        },
    )
