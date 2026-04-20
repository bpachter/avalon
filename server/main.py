"""
Avalon — Datacenter Siting API
Standalone FastAPI server. Scoring engine lives in ../scoring/.
Deploy on Railway; frontend is served from GitHub Pages.
"""

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("avalon")

app = FastAPI(title="Avalon Siting API", version="0.1.0")

# CORS — allow GitHub Pages origin + localhost dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://bpachter.github.io",
        "http://localhost:5173",
        "http://localhost:4173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Scoring engine import
# ---------------------------------------------------------------------------

_SCORING = Path(__file__).parent.parent / "scoring"


def _import_dcsite():
    try:
        if str(_SCORING) not in sys.path:
            sys.path.insert(0, str(_SCORING))
        import importlib
        score_mod  = importlib.import_module("src.score")
        config_mod = importlib.import_module("src.config")
        return score_mod, config_mod
    except Exception as e:
        logger.warning(f"scoring engine unavailable: {e}")
        return None, None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    _, config_mod = _import_dcsite()
    return {"status": "ok", "scoring": config_mod is not None}


# ---------------------------------------------------------------------------
# Siting: factors, score, sample
# ---------------------------------------------------------------------------

class SitingRequest(BaseModel):
    sites: list[dict]
    archetype: str = "training"
    weight_overrides: dict[str, float] | None = None


@app.get("/api/siting/factors")
def siting_factors():
    score_mod, config_mod = _import_dcsite()
    if score_mod is None:
        return JSONResponse(status_code=503, content={"error": "scoring engine unavailable"})
    try:
        return {
            "factors": list(config_mod.FACTOR_NAMES),
            "default_archetype": config_mod.DEFAULT_ARCHETYPE,
            "weights": {
                a: config_mod.load_weights(a)
                for a in ("training", "inference", "mixed")
            },
            "kill_criteria": config_mod.load_kill_criteria(),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/siting/score")
def siting_score(req: SitingRequest):
    score_mod, _ = _import_dcsite()
    if score_mod is None:
        return JSONResponse(status_code=503, content={"error": "scoring engine unavailable"})
    try:
        sites = [
            score_mod.Site(
                site_id=str(s["site_id"]),
                lat=float(s["lat"]),
                lon=float(s["lon"]),
                extras={k: v for k, v in s.items() if k not in {"site_id", "lat", "lon"}},
            )
            for s in req.sites
        ]
        results = score_mod.score_sites(
            sites,
            archetype=req.archetype,
            weight_overrides=req.weight_overrides,
        )
        return {"results": [r.to_dict() for r in results]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/siting/sample")
def siting_sample():
    score_mod, _ = _import_dcsite()
    if score_mod is None:
        return JSONResponse(status_code=503, content={"error": "scoring engine unavailable"})
    import csv as _csv
    sample_csv = _SCORING / "config" / "sample_sites.csv"
    if not sample_csv.exists():
        return JSONResponse(status_code=404, content={"error": "sample_sites.csv missing"})
    try:
        sites = []
        with sample_csv.open(newline="", encoding="utf-8") as f:
            for row in _csv.DictReader(f):
                sites.append(score_mod.Site(
                    site_id=row["site_id"],
                    lat=float(row["lat"]),
                    lon=float(row["lon"]),
                    extras={k: v for k, v in row.items() if k not in {"site_id", "lat", "lon"}},
                ))
        results = score_mod.score_sites(sites, archetype="training")
        return {"results": [r.to_dict() for r in results]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ---------------------------------------------------------------------------
# Live ArcGIS proxy layers
# ---------------------------------------------------------------------------

_HIFLD2   = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services"
_NCONEMAP = "https://services.nconemap.gov/secure/rest/services"

LIVE_LAYER_REGISTRY: dict[str, dict] = {
    "transmission": {
        "name": "Transmission lines", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/US_Electric_Power_Transmission_Lines/FeatureServer/0",
        "where": "1=1",
        "out_fields": "OBJECTID,VOLTAGE,VOLT_CLASS,OWNER,SUB_1,SUB_2,TYPE,STATUS",
        "geom": "line", "color": "#ff3d7f", "style": "voltage", "min_zoom": 5,
        "source": "HIFLD", "max_records": 12000,
    },
    "transmission_duke": {
        "name": "Transmission — Duke-owned", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/US_Electric_Power_Transmission_Lines/FeatureServer/0",
        "where": "OWNER LIKE '%DUKE%'",
        "out_fields": "OBJECTID,VOLTAGE,VOLT_CLASS,OWNER,SUB_1,SUB_2,TYPE,STATUS",
        "geom": "line", "color": "#ff5a3c", "style": "voltage", "min_zoom": 5,
        "source": "HIFLD", "max_records": 8000,
    },
    "power_plants": {
        "name": "Power plants", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/Power_Plants_in_the_US/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "point", "color": "#ff7a00", "min_zoom": 4,
        "source": "HIFLD", "max_records": 6000,
    },
    "power_plants_duke": {
        "name": "Power plants — Duke", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/Power_Plants_in_the_US/FeatureServer/0",
        "where": "Utility_Na LIKE '%DUKE%' OR Utility_Na LIKE '%Duke%'",
        "out_fields": "*",
        "geom": "point", "color": "#ff2db5", "min_zoom": 4,
        "source": "HIFLD", "max_records": 1000,
    },
    "cellular_towers": {
        "name": "Cellular towers", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/Cellular_Towers_in_the_United_States/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "point", "color": "#ffd000", "min_zoom": 9,
        "source": "HIFLD", "max_records": 4000,
    },
    "natgas_pipelines": {
        "name": "Natural gas pipelines", "group": "Other infrastructure",
        "url": f"{_HIFLD2}/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#3aa0ff", "min_zoom": 4,
        "source": "HIFLD", "max_records": 8000,
    },
    "crude_oil_pipelines": {
        "name": "Crude oil pipelines", "group": "Other infrastructure",
        "url": f"{_HIFLD2}/Crude_Oil_Trunk_Pipelines_1/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#a04d2a", "min_zoom": 4,
        "source": "HIFLD", "max_records": 4000,
    },
    "petroleum_pipelines": {
        "name": "Petroleum products pipelines", "group": "Other infrastructure",
        "url": f"{_HIFLD2}/Petroleum_Products_Pipelines_1/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#e65cff", "min_zoom": 4,
        "source": "HIFLD", "max_records": 4000,
    },
    "hgl_pipelines": {
        "name": "Hydrocarbon gas liquids", "group": "Other infrastructure",
        "url": f"{_HIFLD2}/Hydrocarbon_Gas_Liquids_Pipelines_1/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#a07a40", "min_zoom": 4,
        "source": "HIFLD", "max_records": 4000,
    },
    "nc_broadband_status": {
        "name": "Broadband status (NC)", "group": "Connectivity",
        "url": f"{_NCONEMAP}/Broadband/NC_Broadband_Status_Latest/MapServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#00e5ff", "min_zoom": 7,
        "source": "NC OneMap", "max_records": 6000,
    },
    "nc_broadband_funded": {
        "name": "Broadband funded sites (NC)", "group": "Connectivity",
        "url": f"{_NCONEMAP}/Broadband/NC_Broadband_Funded_Locations_Table/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "point", "color": "#00ffae", "min_zoom": 8,
        "source": "NC OneMap", "max_records": 4000,
    },
    "county_subdivisions": {
        "name": "County subdivisions", "group": "Boundaries",
        "url": f"{_HIFLD2}/County_Subdivisions_v1/FeatureServer/0",
        "where": "1=1", "out_fields": "OBJECTID,NAME,STATE_NAME,COUNTY,GEOID",
        "geom": "polygon", "color": "#a0a8b4", "style": "moratorium", "min_zoom": 6,
        "source": "HIFLD", "max_records": 4000,
    },
    "nc_parcels_pts": {
        "name": "Parcels — points (NC)", "group": "Boundaries",
        "url": f"{_NCONEMAP}/NC1Map_Parcels/FeatureServer/0",
        "where": "1=1", "out_fields": "objectid,parno,ownname,improvval",
        "geom": "point", "color": "#fff04a", "min_zoom": 11,
        "source": "NC OneMap", "max_records": 4000,
    },
    "nc_parcels": {
        "name": "Parcel outlines (NC)", "group": "Boundaries",
        "url": f"{_NCONEMAP}/NC1Map_Parcels/FeatureServer/1",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "NC OneMap", "max_records": 4000,
    },
}

US_STATE_BBOX: dict[str, tuple[float, float, float, float]] = {
    "NC": (-84.32, 33.84, -75.46, 36.59),
    "SC": (-83.35, 32.03, -78.54, 35.22),
    "FL": (-87.63, 24.40, -80.03, 31.00),
    "IN": (-88.10, 37.77, -84.78, 41.76),
    "OH": (-84.82, 38.40, -80.52, 41.98),
    "KY": (-89.57, 36.50, -81.96, 39.15),
    "GA": (-85.61, 30.36, -80.84, 34.99),
    "VA": (-83.68, 36.54, -75.24, 39.47),
    "TN": (-90.31, 34.98, -81.65, 36.68),
    "TX": (-106.65, 25.84, -93.51, 36.50),
    "CONUS": (-125.0, 24.5, -66.95, 49.5),
}

DUKE_STATES = ["NC", "SC", "FL", "IN", "OH", "KY"]

_STATE_FULL_NAME: dict[str, str] = {
    "NC": "North Carolina", "SC": "South Carolina", "FL": "Florida",
    "IN": "Indiana", "OH": "Ohio", "KY": "Kentucky",
    "GA": "Georgia", "VA": "Virginia", "TN": "Tennessee", "TX": "Texas",
}

COUNTY_MORATORIUMS: list[dict] = [
    {"state": "Virginia",       "county": "Prince William",  "status": "moratorium", "url": "https://www.pwcva.gov/"},
    {"state": "Virginia",       "county": "Fauquier",        "status": "opposition", "url": ""},
    {"state": "Virginia",       "county": "Culpeper",        "status": "opposition", "url": ""},
    {"state": "Georgia",        "county": "Coweta",          "status": "moratorium", "url": ""},
    {"state": "Georgia",        "county": "Fayette",         "status": "moratorium", "url": ""},
    {"state": "Georgia",        "county": "Douglas",         "status": "opposition", "url": ""},
    {"state": "Georgia",        "county": "Newton",          "status": "opposition", "url": ""},
    {"state": "Indiana",        "county": "Hamilton",        "status": "opposition", "url": ""},
    {"state": "Indiana",        "county": "Boone",           "status": "moratorium", "url": ""},
    {"state": "North Carolina", "county": "Chatham",         "status": "opposition", "url": ""},
    {"state": "North Carolina", "county": "Person",          "status": "opposition", "url": ""},
    {"state": "South Carolina", "county": "York",            "status": "opposition", "url": ""},
    {"state": "Texas",          "county": "Hood",            "status": "opposition", "url": ""},
    {"state": "Texas",          "county": "Bastrop",         "status": "opposition", "url": ""},
    {"state": "Maryland",       "county": "Frederick",       "status": "moratorium", "url": ""},
    {"state": "Maryland",       "county": "Prince George's", "status": "opposition", "url": ""},
    {"state": "Arizona",        "county": "Pinal",           "status": "opposition", "url": ""},
    {"state": "Oregon",         "county": "Morrow",          "status": "opposition", "url": ""},
    {"state": "Oregon",         "county": "Umatilla",        "status": "opposition", "url": ""},
]


def _arcgis_query_url(cfg: dict, bbox: tuple, *, page_size: int, offset: int, extra_where: str | None = None) -> str:
    from urllib.parse import urlencode
    xmin, ymin, xmax, ymax = bbox
    where = cfg["where"]
    if extra_where:
        where = f"({where}) AND ({extra_where})" if where != "1=1" else extra_where
    params = {
        "where": where, "outFields": cfg["out_fields"], "f": "geojson",
        "outSR": 4326, "inSR": 4326, "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "geometry": f"{xmin},{ymin},{xmax},{ymax}",
        "resultRecordCount": page_size, "resultOffset": offset, "returnGeometry": "true",
    }
    return cfg["url"] + "/query?" + urlencode(params)


@app.get("/api/siting/live_layers")
def siting_live_layers():
    return {"layers": [
        {"key": k, "name": c["name"], "group": c["group"], "geom": c["geom"],
         "color": c["color"], "style": c.get("style"), "min_zoom": c["min_zoom"],
         "source": c["source"]}
        for k, c in LIVE_LAYER_REGISTRY.items()
    ]}


@app.get("/api/siting/proxy/{layer_key}")
def siting_proxy(layer_key: str, bbox: str | None = None, limit: int = 8000, state: str | None = None):
    cfg = LIVE_LAYER_REGISTRY.get(layer_key)
    if not cfg:
        return JSONResponse(status_code=404, content={"error": f"unknown layer {layer_key!r}"})
    if not bbox:
        return JSONResponse(status_code=400, content={"error": "bbox required"})
    try:
        parts = [float(x) for x in bbox.split(",")]
        bbox_t = (parts[0], parts[1], parts[2], parts[3])
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"bad bbox: {e}"})

    extra_where: str | None = None
    if state and layer_key in {"power_plants", "power_plants_duke"}:
        full = _STATE_FULL_NAME.get(state.upper())
        if full:
            extra_where = f"State='{full}'"

    cap = int(cfg.get("max_records", 4000))
    target = min(limit, cap)
    page_size = 2000

    feats: list[dict] = []
    truncated = False
    try:
        import requests as _rq
        offset = 0
        while len(feats) < target:
            url = _arcgis_query_url(cfg, bbox_t, page_size=min(page_size, target - len(feats)),
                                    offset=offset, extra_where=extra_where)
            r = _rq.get(url, timeout=30)
            if r.status_code != 200:
                if not feats:
                    return JSONResponse(status_code=502, content={"error": f"upstream {layer_key} HTTP {r.status_code}"})
                truncated = True; break
            try:
                data = r.json()
            except Exception:
                if not feats:
                    return JSONResponse(status_code=502, content={"error": f"upstream {layer_key}: non-JSON"})
                truncated = True; break
            if isinstance(data, dict) and "error" in data and "features" not in data:
                if not feats:
                    return JSONResponse(status_code=502, content={"error": f"upstream: {data.get('error')}"})
                truncated = True; break
            page = data.get("features", []) if isinstance(data, dict) else []
            if not page:
                break
            feats.extend(page)
            props = data.get("properties") or {}
            exceeded = bool(props.get("exceededTransferLimit") or data.get("exceededTransferLimit"))
            if not exceeded and len(page) < page_size:
                break
            if len(feats) >= target:
                truncated = True; break
            offset += len(page)
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"proxy {layer_key} failed: {e}"})

    return {
        "type": "FeatureCollection",
        "features": feats[:target],
        "_meta": {
            "layer": layer_key, "name": cfg["name"], "source": cfg["source"],
            "group": cfg["group"], "geom": cfg["geom"], "color": cfg["color"],
            "style": cfg.get("style"), "min_zoom": cfg["min_zoom"],
            "returned": len(feats), "limit": target, "bbox": bbox,
            "state": state, "truncated": truncated, "live": True,
        },
    }


@app.get("/api/siting/states")
def siting_states():
    return {
        "states": [{"code": c, "bbox": list(b), "duke": c in DUKE_STATES}
                   for c, b in US_STATE_BBOX.items()],
        "duke_states": DUKE_STATES,
    }


@app.get("/api/siting/moratoriums")
def siting_moratoriums():
    return {"counties": COUNTY_MORATORIUMS}


@app.get("/api/siting/parcel_detail")
def siting_parcel_detail(lat: float, lon: float, radius_mi: float = 5.0):
    from math import asin, cos, radians, sin, sqrt
    import requests as _rq

    def _haversine_mi(lat1, lon1, lat2, lon2):
        R = 3958.7613
        dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        return 2 * R * asin(sqrt(a))

    deg = max(0.05, radius_mi / 69.0)
    bbox = (lon - deg, lat - deg, lon + deg, lat + deg)
    targets = [
        ("transmission",     "Nearest transmission line"),
        ("natgas_pipelines", "Nearest natural gas pipeline"),
        ("power_plants",     "Nearest power plant"),
    ]
    out: dict = {"lat": lat, "lon": lon, "radius_mi": radius_mi, "results": []}
    for key, label in targets:
        cfg = LIVE_LAYER_REGISTRY.get(key)
        if not cfg:
            continue
        url = _arcgis_query_url(cfg, bbox, page_size=2000, offset=0)
        try:
            r = _rq.get(url, timeout=20)
            data = r.json() if r.status_code == 200 else {}
        except Exception:
            data = {}
        feats = data.get("features", []) if isinstance(data, dict) else []
        best: float | None = None
        best_props: dict = {}
        for f in feats:
            geom = f.get("geometry") or {}
            coords = geom.get("coordinates") or []

            def _walk(cs):
                vals = []
                for c in cs:
                    if isinstance(c, (int, float)):
                        return [cs]
                    if c and isinstance(c[0], (int, float)):
                        vals.append(c)
                    else:
                        vals.extend(_walk(c))
                return vals

            for px in _walk(coords) if coords else []:
                if len(px) < 2:
                    continue
                d = _haversine_mi(lat, lon, px[1], px[0])
                if best is None or d < best:
                    best = d
                    best_props = f.get("properties") or {}
        out["results"].append({
            "layer": key, "label": label,
            "distance_mi": round(best, 2) if best is not None else None,
            "properties": best_props,
        })
    return out
