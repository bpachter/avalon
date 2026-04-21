"""ISO/RTO interconnection queue ingest + congestion helpers.

This module provides a practical path to live, per-project queue signal:
1) Download CSV/JSON feeds from configured public URLs.
2) Normalize heterogeneous columns to a unified schema.
3) Cache normalized projects under data/raw/iso_queues/<YYYY-MM-DD>/projects.json.
4) Expose congestion metrics around a site for scoring.

If live ingest is unavailable, we degrade to the embedded hub snapshot so
scoring remains operational (with provenance marking fallback mode).
"""
from __future__ import annotations

import csv
import json
import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from .. import config
from ..geo import haversine_mi
from ..reference_data import INTERCONNECTION_QUEUE_HUBS, INTERCONNECTION_QUEUE_PROVENANCE

logger = logging.getLogger(__name__)

TIMEOUT = 12
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Avalon/1.0"
    )
}

# Optional override for operators to point at known-good queue exports.
# Format: comma-separated URLs in env var ISO_QUEUE_SOURCES.
# Example CSV columns expected (aliases supported):
#   queue_id/project_id, iso/rto, status, mw, latitude, longitude, county, state
_DEFAULT_SOURCES: list[str] = [
    # MISO public GI queue JSON (stable API route).
    "https://www.misoenergy.org/api/giqueue/getprojects",
]

_STATUS_ACTIVE = {
    "active", "in-service", "in service", "under construction", "construction",
    "approved", "ia executed", "executed", "proceeding", "online",
}
_STATUS_PENDING = {
    "pending", "queued", "in queue", "study", "feasibility", "system impact",
    "facility study", "withdrawn pending", "submitted", "application",
}
_STATUS_WITHDRAWN = {
    "withdrawn", "cancelled", "canceled", "suspended", "terminated", "rejected",
}


def _cache_path() -> Path:
    today = time.strftime("%Y-%m-%d")
    d = config.RAW_DIR / "iso_queues" / today
    d.mkdir(parents=True, exist_ok=True)
    return d / "projects.json"


def _manifest_path() -> Path:
    today = time.strftime("%Y-%m-%d")
    d = config.RAW_DIR / "iso_queues" / today
    d.mkdir(parents=True, exist_ok=True)
    return d / "manifest.json"


def _configured_sources() -> list[str]:
    env = (os.environ.get("ISO_QUEUE_SOURCES") or "").strip()
    if env:
        return [u.strip() for u in env.split(",") if u.strip()]
    return list(_DEFAULT_SOURCES)


def _get_ci(row: dict[str, Any], *keys: str) -> Any:
    m = {str(k).strip().lower(): v for k, v in row.items()}
    for key in keys:
        k = key.strip().lower()
        if k in m and m[k] not in (None, ""):
            return m[k]
    return None


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s.endswith("MW"):
        s = s[:-2].strip()
    try:
        return float(s)
    except Exception:
        return None


def _norm_status(v: Any) -> str:
    s = str(v or "").strip().lower()
    if not s:
        return "unknown"
    if s in _STATUS_ACTIVE:
        return "active"
    if s in _STATUS_PENDING:
        return "pending"
    if s in _STATUS_WITHDRAWN:
        return "withdrawn"
    # Heuristic contains checks for provider-specific phrases.
    if "withdraw" in s or "cancel" in s or "terminate" in s:
        return "withdrawn"
    if "construct" in s or "service" in s or "approved" in s or "executed" in s:
        return "active"
    if "study" in s or "queue" in s or "pending" in s or "application" in s:
        return "pending"
    return "unknown"


def _norm_iso(v: Any) -> str:
    s = str(v or "").strip().upper()
    if not s:
        return "UNKNOWN"
    aliases = {
        "PJM INTERCONNECTION": "PJM",
        "MIDCONTINENT ISO": "MISO",
        "MIDCONTINENT INDEPENDENT SYSTEM OPERATOR": "MISO",
        "SOUTHWEST POWER POOL": "SPP",
        "CAISO": "CAISO",
        "CALIFORNIA ISO": "CAISO",
        "NYISO": "NYISO",
        "ISO NEW ENGLAND": "ISO-NE",
        "ISONE": "ISO-NE",
        "ERCOT": "ERCOT",
    }
    return aliases.get(s, s)


def _infer_iso_from_source(source_url: str) -> str:
    u = (source_url or "").lower()
    if "misoenergy.org" in u:
        return "MISO"
    if "pjm.com" in u:
        return "PJM"
    if "ercot.com" in u:
        return "ERCOT"
    if "caiso.com" in u:
        return "CAISO"
    if "nyiso.com" in u:
        return "NYISO"
    if "iso-ne.com" in u:
        return "ISO-NE"
    if "spp.org" in u:
        return "SPP"
    return "UNKNOWN"


def _normalize_row(row: dict[str, Any], source_url: str) -> dict[str, Any] | None:
    qid = _get_ci(
        row,
        "queue_id", "project_id", "projectid", "projectnumber", "id",
        "queue number", "queue_num", "gen_queue",
    )
    iso = _norm_iso(_get_ci(row, "iso", "rto", "region", "market"))
    if iso == "UNKNOWN":
        iso = _infer_iso_from_source(source_url)
    status = _norm_status(
        _get_ci(
            row,
            "status", "project_status", "queue_status", "application status", "applicationstatus", "inservice",
        )
    )
    mw = _to_float(_get_ci(row, "mw", "capacity_mw", "queue_mw", "summernetmw", "summer mw", "nameplate_mw"))
    lat = _to_float(_get_ci(row, "lat", "latitude", "poi_lat", "point_lat", "project_lat"))
    lon = _to_float(_get_ci(row, "lon", "longitude", "lng", "poi_lon", "point_lon", "project_lon"))

    if lat is not None and lon is not None:
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            lat, lon = None, None

    name = _get_ci(row, "project_name", "name", "facility", "developer_project", "gen_name", "poiname")
    state = _get_ci(row, "state", "state_code")
    county = _get_ci(row, "county")

    return {
        "queue_id": str(qid or "").strip() or None,
        "iso": iso,
        "status": status,
        "mw": float(mw) if mw is not None else 0.0,
        "lat": float(lat) if lat is not None else None,
        "lon": float(lon) if lon is not None else None,
        "project_name": str(name).strip() if name else None,
        "state": str(state).strip().upper() if state else None,
        "county": str(county).strip() if county else None,
        "source_url": source_url,
    }


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=6), reraise=True)
def _fetch_text(url: str) -> tuple[str, str]:
    r = requests.get(url, timeout=TIMEOUT, headers=UA, allow_redirects=True)
    r.raise_for_status()
    return r.text, (r.headers.get("content-type") or "").lower()


def _parse_payload(text: str, content_type: str, source_url: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    t = text.lstrip()
    # Explicitly ignore HTML landing pages masquerading as data endpoints.
    if "text/html" in content_type or t.lower().startswith("<!doctype html") or "<html" in t[:400].lower():
        return out

    is_json = "json" in content_type or t.startswith("{") or t.startswith("[")
    if is_json:
        try:
            payload = json.loads(text)
        except Exception:
            return out
        rows: list[dict[str, Any]] = []
        if isinstance(payload, list):
            rows = [r for r in payload if isinstance(r, dict)]
        elif isinstance(payload, dict):
            for key in ("data", "results", "projects", "queue", "items"):
                v = payload.get(key)
                if isinstance(v, list):
                    rows = [r for r in v if isinstance(r, dict)]
                    break
        for row in rows:
            n = _normalize_row(row, source_url)
            if n:
                out.append(n)
        return out

    # CSV fallback
    try:
        reader = csv.DictReader(text.splitlines())
        for row in reader:
            n = _normalize_row(row, source_url)
            if n:
                out.append(n)
    except Exception:
        return []
    return out


def _dedupe(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for p in projects:
        key = (
            p.get("queue_id") or "",
            p.get("iso") or "",
            round(float(p.get("lat") or 0.0), 5) if p.get("lat") is not None else None,
            round(float(p.get("lon") or 0.0), 5) if p.get("lon") is not None else None,
            (p.get("state") or ""),
            (p.get("county") or ""),
            round(float(p.get("mw") or 0.0), 2),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _fallback_projects() -> list[dict[str, Any]]:
    # Degrade from hub snapshot to pseudo-projects so scoring still has signal.
    out: list[dict[str, Any]] = []
    for idx, (name, iso, lat, lon, mw) in enumerate(INTERCONNECTION_QUEUE_HUBS, 1):
        out.append({
            "queue_id": f"HUB-{idx:03d}",
            "iso": iso,
            "status": "active",
            "mw": float(mw),
            "lat": float(lat),
            "lon": float(lon),
            "project_name": name,
            "state": None,
            "county": None,
            "source_url": "embedded:INTERCONNECTION_QUEUE_HUBS",
        })
    return out


def latest_cache() -> Path | None:
    root = config.RAW_DIR / "iso_queues"
    if not root.exists():
        return None
    files = sorted(root.glob("*/projects.json"), reverse=True)
    return files[0] if files else None


def download_projects(*, min_projects: int = 25) -> Path:
    """Download and normalize queue projects from configured sources.

    Succeeds if at least `min_projects` normalized projects are parsed.
    Raises RuntimeError otherwise.
    """
    sources = _configured_sources()
    all_rows: list[dict[str, Any]] = []
    source_stats: dict[str, int] = {}

    for url in sources:
        try:
            text, ctype = _fetch_text(url)
            rows = _parse_payload(text, ctype, url)
            rows = _dedupe(rows)
            source_stats[url] = len(rows)
            all_rows.extend(rows)
        except Exception as e:
            logger.warning("iso queue source failed %s: %s", url, e)
            source_stats[url] = -1

    all_rows = _dedupe(all_rows)
    if len(all_rows) < min_projects:
        raise RuntimeError(
            f"insufficient queue projects parsed ({len(all_rows)} < {min_projects}); "
            "set ISO_QUEUE_SOURCES to known-good exports"
        )

    geocoded = sum(1 for r in all_rows if r.get("lat") is not None and r.get("lon") is not None)

    cache = _cache_path()
    cache.write_text(json.dumps(all_rows))
    _manifest_path().write_text(json.dumps({
        "as_of": time.strftime("%Y-%m-%d"),
        "source": "live",
        "sources": source_stats,
        "count": len(all_rows),
        "geocoded_count": geocoded,
    }, indent=2))
    queue_projects.cache_clear()
    return cache


@lru_cache(maxsize=1)
def queue_projects() -> list[dict[str, Any]]:
    """Return normalized projects from cache, or embedded fallback.

    Note: this is intentionally offline-safe and never performs live network IO.
    Use `download_projects()` (CLI ingest path) to refresh the cache explicitly.
    """
    cache = latest_cache()
    if cache is not None:
        try:
            rows = json.loads(cache.read_text())
            if isinstance(rows, list) and rows:
                return [r for r in rows if isinstance(r, dict)]
        except Exception:
            pass

    return _fallback_projects()


def queue_for_iso(iso: str) -> list[dict[str, Any]]:
    iso_u = (iso or "").upper().strip()
    return [p for p in queue_projects() if str(p.get("iso") or "").upper() == iso_u]


def congestion_metrics(lat: float, lon: float, state: str | None = None) -> dict[str, Any] | None:
    """Compute live queue congestion metrics around a site.

    Returns a dictionary with:
      - nearest_project_* fields
      - active_mw_50mi / active_mw_100mi
      - pending_mw_50mi / pending_mw_100mi
      - withdrawn_share_100mi
      - project_count_100mi
    """
    projects = queue_projects()
    if not projects:
        return None

    state_u = (state or "").upper().strip() if state else None

    nearest: tuple[float, dict[str, Any]] | None = None
    active_50 = active_100 = 0.0
    pending_50 = pending_100 = 0.0
    withdrawn_100 = 0.0
    total_100 = 0.0
    count_100 = 0

    for p in projects:
        plat = p.get("lat")
        plon = p.get("lon")
        if plat is None or plon is None:
            continue
        d = haversine_mi(lat, lon, float(plat), float(plon))
        if nearest is None or d < nearest[0]:
            nearest = (d, p)

        mw = float(p.get("mw") or 0.0)
        status = str(p.get("status") or "unknown")
        if d <= 100:
            count_100 += 1
            total_100 += mw
            if status == "active":
                active_100 += mw
            elif status == "pending":
                pending_100 += mw
            elif status == "withdrawn":
                withdrawn_100 += mw
        if d <= 50:
            if status == "active":
                active_50 += mw
            elif status == "pending":
                pending_50 += mw

    if nearest is None:
        # Live feeds like MISO expose state/county without coordinates.
        # Fall back to state-bounded congestion if site state is known.
        if not state_u:
            return None

        active_state = pending_state = withdrawn_state = total_state = 0.0
        count_state = 0
        nearest_like: dict[str, Any] | None = None
        for p in projects:
            pstate = (str(p.get("state") or "").upper().strip())
            if pstate != state_u:
                continue
            mw = float(p.get("mw") or 0.0)
            status = str(p.get("status") or "unknown")
            count_state += 1
            total_state += mw
            if nearest_like is None:
                nearest_like = p
            if status == "active":
                active_state += mw
            elif status == "pending":
                pending_state += mw
            elif status == "withdrawn":
                withdrawn_state += mw

        if count_state == 0:
            return None
        return {
            "nearest_project_distance_mi": None,
            "nearest_project_iso": nearest_like.get("iso") if nearest_like else None,
            "nearest_project_id": nearest_like.get("queue_id") if nearest_like else None,
            "nearest_project_mw": round(float(nearest_like.get("mw") or 0.0), 2) if nearest_like else None,
            "nearest_project_status": nearest_like.get("status") if nearest_like else None,
            "active_mw_50mi": None,
            "pending_mw_50mi": None,
            "active_mw_100mi": round(active_state, 2),
            "pending_mw_100mi": round(pending_state, 2),
            "project_count_100mi": int(count_state),
            "withdrawn_share_100mi": round((withdrawn_state / total_state), 4) if total_state > 0 else 0.0,
            "queue_scope": f"state:{state_u}",
        }

    d_near, p_near = nearest
    return {
        "nearest_project_distance_mi": round(float(d_near), 3),
        "nearest_project_iso": p_near.get("iso"),
        "nearest_project_id": p_near.get("queue_id"),
        "nearest_project_mw": round(float(p_near.get("mw") or 0.0), 2),
        "nearest_project_status": p_near.get("status"),
        "active_mw_50mi": round(active_50, 2),
        "pending_mw_50mi": round(pending_50, 2),
        "active_mw_100mi": round(active_100, 2),
        "pending_mw_100mi": round(pending_100, 2),
        "project_count_100mi": int(count_100),
        "withdrawn_share_100mi": round((withdrawn_100 / total_100), 4) if total_100 > 0 else 0.0,
        "queue_scope": "distance",
    }


def cache_status() -> dict[str, Any]:
    cache = latest_cache()
    if not cache:
        return {"cached": False, "path": None}
    try:
        rows = json.loads(cache.read_text())
        n = len(rows) if isinstance(rows, list) else 0
    except Exception:
        n = 0
    return {"cached": True, "path": str(cache), "projects": n}


def provenance() -> dict[str, Any]:
    cache = latest_cache()
    if cache:
        return {
            "source": "ISO/RTO queue live ingest cache",
            "as_of": cache.parent.name,
            "path": str(cache),
        }
    return dict(INTERCONNECTION_QUEUE_PROVENANCE)
