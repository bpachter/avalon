"""
Avalon — Datacenter Siting API
Standalone FastAPI server. Scoring engine lives in ../scoring/.
Deploy on Railway; frontend is served from GitHub Pages.
"""

import logging
import os
import sys
import traceback
import hashlib
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
_SCORING_IMPORT_ERROR: str | None = None


def _resolve_scoring_root() -> Path | None:
    """Find the scoring package root across local + Railway layouts.

    Railway services are sometimes configured with a non-repo working root,
    so we probe a small set of likely locations and allow SCORING_PATH override.
    """
    env = os.getenv("SCORING_PATH")
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env))
    here = Path(__file__).resolve()
    candidates.extend([
        _SCORING,
        here.parent / "scoring",
        here.parent.parent / "scoring",
        Path.cwd() / "scoring",
    ])
    for p in candidates:
        try:
            if (p / "src" / "score.py").exists():
                return p
        except Exception:
            continue
    return None


def _import_dcsite():
    global _SCORING_IMPORT_ERROR
    try:
        scoring_root = _resolve_scoring_root()
        if scoring_root is None:
            raise FileNotFoundError(
                "could not locate scoring package root; tried SCORING_PATH, repo-relative, and cwd paths"
            )
        if str(scoring_root) not in sys.path:
            sys.path.insert(0, str(scoring_root))
        import importlib
        score_mod  = importlib.import_module("src.score")
        config_mod = importlib.import_module("src.config")
        _SCORING_IMPORT_ERROR = None
        return score_mod, config_mod
    except Exception as e:
        _SCORING_IMPORT_ERROR = f"{e}\n{traceback.format_exc()}"
        logger.warning(f"scoring engine unavailable: {e}")
        return None, None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    _, config_mod = _import_dcsite()
    return {
        "status": "ok",
        "scoring": config_mod is not None,
        "scoring_path": str(_resolve_scoring_root()) if _resolve_scoring_root() else None,
        "scoring_error": _SCORING_IMPORT_ERROR,
    }


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
        return {
            "results": [r.to_dict() for r in results],
            "stub_coverage": score_mod.stub_coverage(results),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/siting/sample")
def siting_sample():
    score_mod, _ = _import_dcsite()
    if score_mod is None:
        return JSONResponse(status_code=503, content={"error": "scoring engine unavailable"})
    import csv as _csv
    scoring_root = _resolve_scoring_root()
    if scoring_root is None:
        return JSONResponse(status_code=503, content={"error": "scoring engine unavailable"})
    sample_csv = scoring_root / "config" / "sample_sites.csv"
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
        return {
            "results": [r.to_dict() for r in results],
            "stub_coverage": score_mod.stub_coverage(results),
        }
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
        "geom": "line", "color": "#ff3d7f", "style": "voltage", "min_zoom": 4,
        "source": "HIFLD", "max_records": 50000, "page_size": 2000,
    },
    "transmission_duke": {
        "name": "Transmission — Duke-owned", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/US_Electric_Power_Transmission_Lines/FeatureServer/0",
        "where": "OWNER LIKE '%DUKE%'",
        "out_fields": "OBJECTID,VOLTAGE,VOLT_CLASS,OWNER,SUB_1,SUB_2,TYPE,STATUS",
        "geom": "line", "color": "#ff5a3c", "style": "voltage", "min_zoom": 4,
        "source": "HIFLD", "max_records": 50000, "page_size": 2000,
    },
    "power_plants": {
        "name": "Power plants", "group": "Grid & infrastructure",
        "url": f"{_HIFLD2}/Power_Plants_in_the_US/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "point", "color": "#ff7a00", "min_zoom": 4,
        "source": "HIFLD", "max_records": 50000, "page_size": 2000,
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
    "substations": {
        "name": "Electric substations", "group": "Grid & infrastructure",
        "url": "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Substations/FeatureServer/0",
        "source_urls": [
            "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Substations/FeatureServer/0",
            "https://services.arcgis.com/G4S1dGvn7PIgYd6Y/arcgis/rest/services/HIFLD_electric_power_substations/FeatureServer/0",
        ],
        "where": "1=1", "out_fields": "*",
        "geom": "point", "color": "#ffe066", "min_zoom": 4,
        "source": "HIFLD", "max_records": 50000, "page_size": 2000,
    },
    "natgas_pipelines": {
        "name": "Natural gas pipelines", "group": "Other infrastructure",
        # Primary: HIFLD EIA-sourced republish; this service mirror ends in
        # `_1` and is the most reliable public feed. Fallback to a second
        # mirror in case the primary's SSL handshake resets (common under
        # load on services2.arcgis.com).
        "url": f"{_HIFLD2}/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0",
        "source_urls": [
            f"{_HIFLD2}/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0",
            "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines/FeatureServer/0",
            "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Natural_Gas_Pipelines/FeatureServer/0",
        ],
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#3aa0ff", "min_zoom": 4,
        "source": "HIFLD", "max_records": 50000, "page_size": 2000,
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
    # NC Broadband's NC OneMap service was deprecated (2025 reorg); replaced
    # here with a national long-haul fiber layer pulled from OpenStreetMap
    # via Overpass API (see /api/siting/fiber_lines below). The registry
    # entry is exposed through the same live-layers list so the map
    # toggle UX stays consistent.
    "fiber_lines": {
        "name": "Fiber optic cables", "group": "Connectivity",
        # This layer is served by our in-process Overpass proxy; the proxy
        # returns GeoJSON directly instead of querying an ArcGIS endpoint.
        "url": "__INTERNAL__/fiber_lines",
        "where": "1=1", "out_fields": "*",
        "geom": "line", "color": "#38bdf8", "min_zoom": 6,
        "source": "OpenStreetMap", "max_records": 50000, "page_size": 5000,
        "internal": True,
    },
    "fema_flood_zones": {
        "name": "FEMA flood hazard zones", "group": "Hazards & environment",
        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
        "where": "1=1",
        "out_fields": "OBJECTID,FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE",
        "geom": "polygon", "color": "#7ad0ff", "min_zoom": 8,
        # FEMA's NFHL gateway 504s when asked for >1000 polygons in a single
        # request. Keep page_size small and rely on pagination to assemble the
        # viewport's polygons.
        "source": "FEMA NFHL", "max_records": 50000, "page_size": 500,
    },
    "usfws_wetlands": {
        "name": "USFWS wetlands (NWI)", "group": "Hazards & environment",
        "url": "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0",
        "source_urls": [
            "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0",
            "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0",
        ],
        "where": "1=1",
        # MapServer joins two tables; use "*" so we don't have to hardcode
        # table-prefixed field names like Wetlands.OBJECTID. Keeps query valid.
        "out_fields": "*",
        "geom": "polygon", "color": "#3ad6a0", "min_zoom": 9,
        "source": "USFWS NWI", "max_records": 50000, "page_size": 1000,
    },
    "county_subdivisions": {
        "name": "County subdivisions", "group": "Boundaries",
        "url": f"{_HIFLD2}/County_Subdivisions_v1/FeatureServer/0",
        "where": "1=1", "out_fields": "OBJECTID,NAME,STATE_NAME,COUNTY,GEOID",
        "geom": "polygon", "color": "#a0a8b4", "style": "moratorium", "min_zoom": 6,
        "source": "HIFLD", "max_records": 4000,
    },
    # Datacenter opposition counties — rendered red. Uses our curated list
    # of counties with documented public opposition to datacenters (moved
    # from moratoriums in a separate endpoint). Served internally by joining
    # COUNTY_MORATORIUMS entries to county polygons from the US Census
    # TIGER counties service.
    "county_opposition": {
        "name": "Datacenter opposition (counties)", "group": "Boundaries",
        "url": "__INTERNAL__/county_opposition",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#ff2e3a", "style": "opposition",
        "min_zoom": 0,
        "source": "Curated (news/econ-dev releases + local hearings)",
        "max_records": 500, "page_size": 500,
        "internal": True,
    },
    "nc_parcels": {
        "name": "Parcel outlines (NC)", "group": "Boundaries",
        "url": f"{_NCONEMAP}/NC1Map_Parcels/FeatureServer/1",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "NC OneMap", "max_records": 2000, "page_size": 1000,
        "state": "NC",
    },
    "sc_parcels": {
        "name": "Parcel outlines (SC – York)", "group": "Boundaries",
        # York County, SC — only verified open SC statewide-style parcel feed
        # we could reach without a token. Future: add additional county feeds.
        "url": "https://services1.arcgis.com/2AGLxyiJoNiVHKwq/arcgis/rest/services/Parcels/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "York County SC GIS", "max_records": 2000, "page_size": 1000,
        "state": "SC",
    },
    "fl_parcels": {
        "name": "Parcel outlines (FL)", "group": "Boundaries",
        "url": "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "FDOR Cadastral (FL DOR)", "max_records": 1500, "page_size": 500,
        "state": "FL",
    },
    "in_parcels": {
        "name": "Parcel outlines (IN)", "group": "Boundaries",
        "url": "https://gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "IndianaMap (IGIO)", "max_records": 2000, "page_size": 1000,
        "state": "IN",
    },
    "oh_parcels": {
        "name": "Parcel outlines (OH)", "group": "Boundaries",
        "url": "https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "OGRIP Ohio Statewide Parcels", "max_records": 2000, "page_size": 1000,
        "state": "OH",
    },
    "ky_parcels": {
        "name": "Parcel outlines (KY – Jefferson)", "group": "Boundaries",
        # Jefferson County (Louisville) PVA — only verified open KY statewide-
        # style parcel feed we could reach without a token. Future: add more.
        "url": "https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/New_AllParcels/FeatureServer/0",
        "where": "1=1", "out_fields": "*",
        "geom": "polygon", "color": "#fff04a", "min_zoom": 14,
        "source": "Jefferson County KY PVA", "max_records": 2000, "page_size": 1000,
        "state": "KY",
    },
}

# State → parcel layer key. Used by frontend to swap the active parcel
# overlay when the state selector changes, and by parcel_attrs to look up
# the correct FeatureServer for point-in-polygon queries.
STATE_PARCEL_LAYER: dict[str, str] = {
    "NC": "nc_parcels",
    "SC": "sc_parcels",
    "FL": "fl_parcels",
    "IN": "in_parcels",
    "OH": "oh_parcels",
    "KY": "ky_parcels",
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

# State adjacency used to bound heavy line-layer queries to selected + border states.
# This trims payload volume while preserving edge effects near state borders.
STATE_BORDER_MAP: dict[str, list[str]] = {
    "NC": ["VA", "SC", "GA", "TN"],
    "SC": ["NC", "GA"],
    "FL": ["GA", "AL"],
    "IN": ["IL", "MI", "OH", "KY"],
    "OH": ["MI", "PA", "WV", "KY", "IN"],
    "KY": ["IL", "IN", "OH", "WV", "VA", "TN", "MO"],
    "GA": ["FL", "AL", "TN", "NC", "SC"],
    "VA": ["NC", "TN", "KY", "WV", "MD"],
    "TN": ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
    "TX": ["NM", "OK", "AR", "LA"],
}

_STATE_FULL_NAME: dict[str, str] = {
    "NC": "North Carolina", "SC": "South Carolina", "FL": "Florida",
    "IN": "Indiana", "OH": "Ohio", "KY": "Kentucky",
    "GA": "Georgia", "VA": "Virginia", "TN": "Tennessee", "TX": "Texas",
}

COUNTY_MORATORIUMS: list[dict] = [
    {"state": "Virginia",       "county": "Prince William",  "status": "moratorium", "url": "https://www.pwcva.gov/office/board-of-county-supervisors"},
    {"state": "Virginia",       "county": "Fauquier",        "status": "opposition", "url": "https://www.fauquiercounty.gov/government/boards-committees/board-of-supervisors"},
    {"state": "Virginia",       "county": "Culpeper",        "status": "opposition", "url": "https://www.culpepercounty.gov/"},
    {"state": "Georgia",        "county": "Coweta",          "status": "moratorium", "url": "https://www.coweta.ga.us/government"},
    {"state": "Georgia",        "county": "Fayette",         "status": "moratorium", "url": "https://www.fayettecountyga.gov/"},
    {"state": "Georgia",        "county": "Douglas",         "status": "opposition", "url": "https://www.celebratedouglascounty.com/"},
    {"state": "Georgia",        "county": "Newton",          "status": "opposition", "url": "https://www.co.newton.ga.us/"},
    {"state": "Indiana",        "county": "Hamilton",        "status": "opposition", "url": "https://www.hamiltoncounty.in.gov/"},
    {"state": "Indiana",        "county": "Boone",           "status": "moratorium", "url": "https://www.boonecounty.in.gov/"},
    {"state": "North Carolina", "county": "Chatham",         "status": "opposition", "url": "https://www.chathamcountync.gov/"},
    {"state": "North Carolina", "county": "Person",          "status": "opposition", "url": "https://www.personcountync.gov/"},
    {"state": "South Carolina", "county": "York",            "status": "opposition", "url": "https://www.yorkcountygov.com/"},
    {"state": "Texas",          "county": "Hood",            "status": "opposition", "url": "https://www.co.hood.tx.us/"},
    {"state": "Texas",          "county": "Bastrop",         "status": "opposition", "url": "https://www.bastropcountytx.gov/"},
    {"state": "Maryland",       "county": "Frederick",       "status": "moratorium", "url": "https://frederickcountymd.gov/"},
    {"state": "Maryland",       "county": "Prince George's", "status": "opposition", "url": "https://www.princegeorgescountymd.gov/"},
    {"state": "Arizona",        "county": "Pinal",           "status": "opposition", "url": "https://www.pinal.gov/"},
    {"state": "Oregon",         "county": "Morrow",          "status": "opposition", "url": "https://www.co.morrow.or.us/"},
    {"state": "Oregon",         "county": "Umatilla",        "status": "opposition", "url": "https://www.umatillacounty.gov/"},
    # Additional counties with publicly-documented datacenter opposition,
    # pulled from local news, council hearings, econ-dev releases, and
    # project-delay filings through early 2026.
    {"state": "Virginia",       "county": "Loudoun",         "status": "opposition", "url": "https://www.loudoun.gov/"},
    {"state": "Virginia",       "county": "Stafford",        "status": "opposition", "url": "https://staffordcountyva.gov/"},
    {"state": "Virginia",       "county": "Spotsylvania",    "status": "opposition", "url": "https://www.spotsylvania.va.us/"},
    {"state": "Virginia",       "county": "Warren",          "status": "opposition", "url": "https://warrencountyva.gov/"},
    {"state": "Georgia",        "county": "Cherokee",        "status": "opposition", "url": "https://www.cherokeega.com/"},
    {"state": "Georgia",        "county": "Walton",          "status": "opposition", "url": "https://www.waltoncountyga.gov/"},
    {"state": "North Carolina", "county": "Alamance",        "status": "opposition", "url": "https://www.alamance-nc.com/"},
    {"state": "North Carolina", "county": "Caswell",         "status": "opposition", "url": "https://www.caswellcountync.gov/"},
    {"state": "Ohio",           "county": "Licking",         "status": "opposition", "url": "https://www.lcounty.com/"},
    {"state": "Ohio",           "county": "Union",           "status": "opposition", "url": "https://www.co.union.oh.us/"},
    {"state": "Indiana",        "county": "Hendricks",       "status": "opposition", "url": "https://www.co.hendricks.in.us/"},
    {"state": "Texas",          "county": "Ellis",           "status": "opposition", "url": "https://www.co.ellis.tx.us/"},
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
    # Server-side geometry simplification by zoom: drops vertices below the
    # tolerance so 30k-vertex pipeline polylines come back as ~2k vertices,
    # cutting payload + render time by 5–10× without visible loss at the
    # current viewport.
    bbox_deg = max(xmax - xmin, ymax - ymin)
    if bbox_deg > 0:
        # ~1px at the viewport's pixel density (assume ~800px wide).
        params["maxAllowableOffset"] = round(bbox_deg / 800.0, 6)
    return cfg["url"] + "/query?" + urlencode(params)


def _arcgis_query_url_for_source(
    cfg: dict,
    source_url: str,
    bbox: tuple,
    *,
    page_size: int,
    offset: int,
    extra_where: str | None = None,
) -> str:
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
    bbox_deg = max(xmax - xmin, ymax - ymin)
    if bbox_deg > 0:
        params["maxAllowableOffset"] = round(bbox_deg / 800.0, 6)
    return source_url + "/query?" + urlencode(params)


def _feature_sig(f: dict) -> str:
    """Stable signature for de-duplicating features across multiple ArcGIS feeds."""
    g = f.get("geometry") or {}
    p = f.get("properties") or {}
    seed = {
        "gt": g.get("type"),
        # hashing full geometry is cheap enough for our payload sizes
        "gc": g.get("coordinates"),
        "id": p.get("OBJECTID") or p.get("OBJECTID_1") or p.get("ID"),
        "nm": p.get("Pipename") or p.get("PIPELINE_NAME") or p.get("NAME"),
        "op": p.get("Operator") or p.get("OPERATOR") or p.get("OWNER"),
    }
    return hashlib.sha1(str(seed).encode("utf-8")).hexdigest()


def _norm_natgas_props(props: dict) -> dict:
    """Normalize common natural-gas fields across source variants."""
    out = dict(props)
    out["name"] = (
        props.get("Pipename") or props.get("PIPELINE_NAME") or props.get("PIPE_NAME")
        or props.get("NAME")
    )
    out["operator"] = (
        props.get("Operator") or props.get("OPERATOR") or props.get("OWNER")
        or props.get("COMPANY")
    )
    out["status_norm"] = (
        props.get("STATUS") or props.get("OPER_STAT") or props.get("OP_STATUS")
    )
    out["diameter_in"] = (
        props.get("Diameter") or props.get("DIAMETER") or props.get("DIAM_IN")
    )
    return out


def _bbox_union(boxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float] | None:
    if not boxes:
        return None
    xmin = min(b[0] for b in boxes)
    ymin = min(b[1] for b in boxes)
    xmax = max(b[2] for b in boxes)
    ymax = max(b[3] for b in boxes)
    return (xmin, ymin, xmax, ymax)


def _bbox_intersection(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> tuple[float, float, float, float] | None:
    xmin = max(a[0], b[0])
    ymin = max(a[1], b[1])
    xmax = min(a[2], b[2])
    ymax = min(a[3], b[3])
    if xmin >= xmax or ymin >= ymax:
        return None
    return (xmin, ymin, xmax, ymax)


def _state_plus_neighbors_bbox(state_code: str) -> tuple[float, float, float, float] | None:
    st = state_code.upper().strip()
    states = [st, *STATE_BORDER_MAP.get(st, [])]
    boxes = [US_STATE_BBOX[s] for s in states if s in US_STATE_BBOX]
    return _bbox_union(boxes)


def _resilient_get(url: str, *, timeout: int = 30, retries: int = 3):
    """GET with retry/backoff for transient upstream failures.

    Large public ArcGIS feeds (FiaPA4, HDR, hazards.fema.gov) frequently
    reset SSL connections under load (WinError 10054 / 502 / 504). Rather
    than propagate a 502 to the browser on the first hiccup, retry with
    exponential backoff so a momentarily-unreachable upstream doesn't
    break the whole overlay.
    """
    import time as _t
    import requests as _rq

    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            r = _rq.get(url, timeout=timeout)
            # Don't retry 4xx — those are request problems, not transient.
            if r.status_code < 500:
                return r
            last_exc = RuntimeError(f"HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001 — include socket resets, SSL errors
            last_exc = e
        _t.sleep(0.35 * (2 ** attempt))
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("resilient_get: exhausted retries")


# ---------------------------------------------------------------------------
# Internal layer handlers (fiber optic + datacenter opposition counties)
# ---------------------------------------------------------------------------

# Overpass API (OpenStreetMap) — used for fiber-route geometry. OSM tags
# long-haul fiber as `telecom=line`, `man_made=cable` (telecom), or
# `communication=line`. We union these into a single FeatureCollection.
_OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
]


def _fiber_lines_fc(bbox_t: tuple[float, float, float, float], *, limit: int, state: str | None):
    """OpenStreetMap-sourced long-haul fiber routes inside bbox.

    Paces uses a curated paid fiber layer; the best open-data analogue is
    OSM's `telecom=line` / `man_made=cable` (telecom) tagging, which
    captures the backbone routes that utility-scale siting teams actually
    care about. Served through our proxy so the browser never talks to
    Overpass directly (CORS-safe, cacheable at the Railway edge).
    """
    xmin, ymin, xmax, ymax = bbox_t
    # Clip to state-region to keep payloads reasonable even at zoom-4.
    if state:
        region = _state_plus_neighbors_bbox(state)
        if region:
            clipped = _bbox_intersection(bbox_t, region)
            if clipped is None:
                return {"type": "FeatureCollection", "features": [],
                        "_meta": {"layer": "fiber_lines", "returned": 0, "source": "OpenStreetMap",
                                  "state": state, "clipped_to_state_region": True, "live": True}}
            xmin, ymin, xmax, ymax = clipped
    # Overpass query: all ways tagged as fiber / telecom / communication lines.
    # Bounding box format Overpass expects: (south, west, north, east).
    ql = (
        f"[out:json][timeout:25];"
        f"("
        f"  way['telecom'='line']({ymin},{xmin},{ymax},{xmax});"
        f"  way['communication'='line']({ymin},{xmin},{ymax},{xmax});"
        f"  way['man_made'='cable']['location'!='underwater']({ymin},{xmin},{ymax},{xmax});"
        f"  way['cable'='fiber']({ymin},{xmin},{ymax},{xmax});"
        f");"
        f"out geom;"
    )
    import requests as _rq
    data: dict | None = None
    last_err: str | None = None
    # Overpass requires a real User-Agent header — returns HTTP 406 otherwise.
    headers = {
        "User-Agent": "avalon-siting/1.0 (+https://github.com/bpachter/avalon)",
        "Accept": "application/json",
    }
    for ep in _OVERPASS_ENDPOINTS:
        try:
            r = _rq.post(ep, data={"data": ql}, headers=headers, timeout=45)
            if r.status_code == 200:
                data = r.json()
                break
            last_err = f"{ep.split('//')[1].split('/')[0]} HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
            continue
    if data is None:
        # Empty FC instead of 502 — OSM is best-effort and shouldn't
        # break the map when Overpass is rate-limiting.
        return {
            "type": "FeatureCollection",
            "features": [],
            "_meta": {
                "layer": "fiber_lines", "source": "OpenStreetMap (Overpass API)",
                "returned": 0, "limit": limit, "live": True,
                "warning": f"Overpass unreachable ({last_err}); try again in a minute",
            },
        }

    feats: list[dict] = []
    for el in data.get("elements", []):
        if el.get("type") != "way":
            continue
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue
        coords = [[pt.get("lon"), pt.get("lat")] for pt in geom
                  if pt.get("lon") is not None and pt.get("lat") is not None]
        if len(coords) < 2:
            continue
        tags = el.get("tags") or {}
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "osm_id": el.get("id"),
                "operator": tags.get("operator"),
                "name": tags.get("name"),
                "location": tags.get("location"),
                "telecom": tags.get("telecom"),
                "communication": tags.get("communication"),
                "man_made": tags.get("man_made"),
                "cable": tags.get("cable"),
                "source_osm_tags": tags,
            },
        })
        if len(feats) >= limit:
            break

    return {
        "type": "FeatureCollection",
        "features": feats,
        "_meta": {
            "layer": "fiber_lines", "name": "Fiber optic cables",
            "source": "OpenStreetMap (Overpass API)", "group": "Connectivity",
            "geom": "line", "color": "#ffa726", "min_zoom": 6,
            "returned": len(feats), "limit": limit,
            "bbox": f"{xmin},{ymin},{xmax},{ymax}",
            "state": state, "live": True,
        },
    }


# County boundary service — HIFLD `Counties_v1` mirrors the Census TIGER
# polygons but is more reliable than tigerweb.geo.census.gov from Railway.
# Used by the opposition-county layer to render flagged counties red.
_HIFLD_COUNTIES = f"{_HIFLD2}/Counties_v1/FeatureServer/0"
_OPPOSITION_CACHE: dict[str, dict] = {}


def _county_opposition_fc(bbox_t: tuple[float, float, float, float], *, limit: int, state: str | None):
    """Polygon layer of counties flagged as having datacenter opposition."""
    from urllib.parse import urlencode

    flags: dict[tuple[str, str], dict] = {}
    for row in COUNTY_MORATORIUMS:
        if (row.get("status") or "").lower() != "opposition":
            continue
        flags[(row["state"].strip(), row["county"].strip())] = row
    if not flags:
        return {"type": "FeatureCollection", "features": [],
                "_meta": {"layer": "county_opposition", "returned": 0, "live": True}}

    # Group by state for a single bulk request per state. Using STATE_NAME
    # avoids a 1000-feature limit hit and gives us cache locality.
    states_needed = sorted({s for s, _c in flags.keys()})
    feats: list[dict] = []
    xmin, ymin, xmax, ymax = bbox_t

    for st_name in states_needed:
        cached = _OPPOSITION_CACHE.get(st_name)
        if cached is None:
            counties_in_state = [c for s, c in flags.keys() if s == st_name]
            # Build a NAME IN (...) clause so we only fetch the polygons we need.
            quoted = ",".join("'" + c.replace("'", "''") + "'" for c in counties_in_state)
            where = f"STATE_NAME='{st_name}' AND NAME IN ({quoted})"
            params = {
                "where": where,
                "outFields": "NAME,STATE_NAME,FIPS",
                "f": "geojson", "outSR": 4326, "returnGeometry": "true",
                "resultRecordCount": 200,
                # Simplify polygons aggressively — we only need the silhouette.
                "maxAllowableOffset": 0.005,
            }
            try:
                r = _resilient_get(_HIFLD_COUNTIES + "/query?" + urlencode(params),
                                   timeout=25, retries=3)
                cached = r.json() if r.status_code == 200 else {"features": []}
            except Exception:  # noqa: BLE001
                cached = {"features": []}
            _OPPOSITION_CACHE[st_name] = cached

        for cf in cached.get("features", []):
            props = cf.get("properties") or {}
            name = (props.get("NAME") or "").strip()
            key = (st_name, name)
            hit = flags.get(key)
            if not hit:
                continue
            new_props = dict(props)
            new_props["opposition_status"] = hit.get("status")
            new_props["opposition_url"] = hit.get("url")
            new_props["opposition_state"] = hit.get("state")
            new_props["opposition_county"] = hit.get("county")
            feats.append({
                "type": "Feature",
                "geometry": cf.get("geometry"),
                "properties": new_props,
            })

    # Bbox overlap test: keep features whose polygon bbox intersects the
    # requested viewport. More permissive than vertex-in-bbox so polygons
    # that fully enclose the viewport still pass.
    def _feature_bbox(feature: dict) -> tuple[float, float, float, float] | None:
        g = feature.get("geometry") or {}
        coords = g.get("coordinates") or []
        xs: list[float] = []
        ys: list[float] = []
        def _walk(cs):
            if not cs:
                return
            if isinstance(cs[0], (int, float)) and len(cs) >= 2:
                xs.append(float(cs[0])); ys.append(float(cs[1]))
                return
            for sub in cs:
                _walk(sub)
        _walk(coords)
        if not xs:
            return None
        return (min(xs), min(ys), max(xs), max(ys))

    def _bbox_overlap(b: tuple[float, float, float, float] | None) -> bool:
        if b is None:
            return False
        return not (b[2] < xmin or b[0] > xmax or b[3] < ymin or b[1] > ymax)

    feats = [f for f in feats if _bbox_overlap(_feature_bbox(f))][:limit]
    return {
        "type": "FeatureCollection",
        "features": feats,
        "_meta": {
            "layer": "county_opposition", "name": "Datacenter opposition (counties)",
            "source": "Curated (news/econ-dev releases + local hearings)",
            "group": "Boundaries",
            "geom": "polygon", "color": "#ff2e3a", "style": "opposition",
            "min_zoom": 0, "returned": len(feats), "limit": limit,
            "bbox": f"{xmin},{ymin},{xmax},{ymax}",
            "state": state, "live": True,
        },
    }


@app.get("/api/siting/live_layers")
def siting_live_layers():
    return {"layers": [
        {"key": k, "name": c["name"], "group": c["group"], "geom": c["geom"],
         "color": c["color"], "style": c.get("style"), "min_zoom": c["min_zoom"],
         "source": c["source"], "state": c.get("state")}
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

    # Internal layers — fiber + opposition — are served by in-process
    # handlers instead of an ArcGIS upstream.
    if cfg.get("internal"):
        if layer_key == "fiber_lines":
            return _fiber_lines_fc(bbox_t, limit=limit, state=state)
        if layer_key == "county_opposition":
            return _county_opposition_fc(bbox_t, limit=limit, state=state)

    extra_where: str | None = None
    # Constrain high-volume infra layers to selected state + border states.
    if state and layer_key in {
        "transmission", "transmission_duke", "natgas_pipelines",
        "crude_oil_pipelines", "petroleum_pipelines", "hgl_pipelines",
        "substations", "fema_flood_zones", "usfws_wetlands",
    }:
        state_region = _state_plus_neighbors_bbox(state)
        if state_region:
            clipped = _bbox_intersection(bbox_t, state_region)
            if clipped is None:
                return {
                    "type": "FeatureCollection",
                    "features": [],
                    "_meta": {
                        "layer": layer_key,
                        "state": state,
                        "returned": 0,
                        "limit": 0,
                        "bbox": bbox,
                        "clipped_to_state_region": True,
                        "live": True,
                    },
                }
            bbox_t = clipped

    if state:
        st = state.upper()
        if layer_key in {"power_plants", "power_plants_duke"}:
            full = _STATE_FULL_NAME.get(st)
            if full:
                extra_where = f"State='{full}'"
        elif layer_key in {"transmission", "transmission_duke"}:
            # Current HIFLD transmission feed used by the map has no STATE fields.
            # Keep transmission constrained by bbox only to avoid upstream SQL errors.
            extra_where = None

    cap = int(cfg.get("max_records", 4000))
    target = min(limit, cap)
    page_size = int(cfg.get("page_size", 2000))
    source_urls: list[str] = list(cfg.get("source_urls") or [cfg["url"]])

    feats: list[dict] = []
    seen: set[str] = set()
    source_breakdown: dict[str, int] = {}
    truncated = False
    try:
        import requests as _rq
        for source_url in source_urls:
            offset = 0
            source_key = source_url.split("/arcgis/")[0]
            source_breakdown.setdefault(source_key, 0)
            while len(feats) < target:
                url = _arcgis_query_url_for_source(
                    cfg,
                    source_url,
                    bbox_t,
                    page_size=min(page_size, target - len(feats)),
                    offset=offset,
                    extra_where=extra_where,
                )
                try:
                    r = _resilient_get(url, timeout=30, retries=3)
                except Exception as exc:  # noqa: BLE001
                    if not feats:
                        # Failover to the next mirror in source_urls before 502ing
                        # the browser. Only give up once all sources exhausted.
                        break
                    truncated = True
                    break
                if r.status_code != 200:
                    if not feats:
                        break  # try next source_url mirror
                    truncated = True
                    break
                try:
                    data = r.json()
                except Exception:
                    if not feats:
                        return JSONResponse(status_code=502, content={"error": f"upstream {layer_key}: non-JSON"})
                    truncated = True
                    break
                if isinstance(data, dict) and "error" in data and "features" not in data:
                    if not feats:
                        return JSONResponse(status_code=502, content={"error": f"upstream: {data.get('error')}"})
                    truncated = True
                    break
                page = data.get("features", []) if isinstance(data, dict) else []
                if not page:
                    break

                for f in page:
                    sig = _feature_sig(f)
                    if sig in seen:
                        continue
                    seen.add(sig)
                    if layer_key == "natgas_pipelines":
                        f["properties"] = _norm_natgas_props(f.get("properties") or {})
                    feats.append(f)
                    source_breakdown[source_key] += 1
                    if len(feats) >= target:
                        break

                props = data.get("properties") or {}
                exceeded = bool(props.get("exceededTransferLimit") or data.get("exceededTransferLimit"))
                if not exceeded and len(page) < page_size:
                    break
                if len(feats) >= target:
                    truncated = True
                    break
                offset += len(page)

            if len(feats) >= target:
                break
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"proxy {layer_key} failed: {e}"})

    response = JSONResponse({
        "type": "FeatureCollection",
        "features": feats[:target],
        "_meta": {
            "layer": layer_key, "name": cfg["name"], "source": cfg["source"],
            "group": cfg["group"], "geom": cfg["geom"], "color": cfg["color"],
            "style": cfg.get("style"), "min_zoom": cfg["min_zoom"],
            "returned": len(feats), "limit": target,
            "bbox": bbox, "bbox_used": f"{bbox_t[0]},{bbox_t[1]},{bbox_t[2]},{bbox_t[3]}",
            "state": state, "truncated": truncated, "live": True,
            "source_count": len(source_urls), "source_breakdown": source_breakdown,
        },
    })
    # Aggressive browser caching: identical bbox+state+layer requests are
    # served instantly from the browser/Railway edge instead of re-querying
    # the upstream. 5-minute private TTL is short enough that infrastructure
    # updates appear quickly while panning the same area is essentially free.
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    return response


@app.get("/api/siting/qa/natgas_coverage")
def siting_qa_natgas_coverage(state: str = "NC", limit: int = 12000):
    """Quick QA snapshot of natural-gas pipeline source coverage in state region."""
    st = state.upper().strip()
    if st not in US_STATE_BBOX:
        return JSONResponse(status_code=400, content={"error": f"unknown state {state!r}"})
    region = _state_plus_neighbors_bbox(st)
    if region is None:
        return JSONResponse(status_code=400, content={"error": f"no bbox for state {state!r}"})
    bbox = f"{region[0]},{region[1]},{region[2]},{region[3]}"
    out = siting_proxy("natgas_pipelines", bbox=bbox, limit=limit, state=st)
    if isinstance(out, JSONResponse):
        return out
    return {
        "state": st,
        "region_bbox": bbox,
        "returned": len(out.get("features", [])),
        "meta": out.get("_meta", {}),
    }


def _queue_freshness_snapshot(state_code: str) -> dict:
    """Return scoring queue-ingest cache freshness + quick congestion snapshot."""
    score_mod, _ = _import_dcsite()
    if score_mod is None:
        return {"ok": False, "error": "scoring engine unavailable"}
    try:
        import importlib

        iq = importlib.import_module("src.ingest.iso_queues")
        cache = iq.cache_status()
        prov = iq.provenance()
        projects = iq.queue_projects()

        iso_counts: dict[str, int] = {}
        for p in projects:
            iso = str(p.get("iso") or "UNKNOWN")
            iso_counts[iso] = iso_counts.get(iso, 0) + 1

        b = US_STATE_BBOX.get(state_code, US_STATE_BBOX["CONUS"])
        center_lat = (b[1] + b[3]) / 2
        center_lon = (b[0] + b[2]) / 2
        metrics = iq.congestion_metrics(center_lat, center_lon, state=state_code)

        return {
            "ok": True,
            "cache": cache,
            "provenance": prov,
            "projects": len(projects),
            "geocoded_projects": sum(1 for p in projects if p.get("lat") is not None and p.get("lon") is not None),
            "iso_counts": iso_counts,
            "state_metrics": metrics,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/siting/qa/queue_freshness")
def siting_qa_queue_freshness(state: str = "NC"):
    st = state.upper().strip()
    return {
        "state": st,
        "queue": _queue_freshness_snapshot(st),
    }


@app.get("/api/siting/qa/coverage")
def siting_qa_coverage(state: str = "NC", layers: str | None = None, limit: int = 1500):
    """Cross-layer data-quality snapshot for a state region.

    Returns per-layer feature counts, source breakdown, fetch latency, and
    coverage confidence flags. Powers the frontend Data Quality panel — this
    is the provenance surface that distinguishes us from a black-box aggregator.
    """
    import time as _time
    st = state.upper().strip()
    if st not in US_STATE_BBOX:
        return JSONResponse(status_code=400, content={"error": f"unknown state {state!r}"})
    region = _state_plus_neighbors_bbox(st) or US_STATE_BBOX[st]
    bbox = f"{region[0]},{region[1]},{region[2]},{region[3]}"

    default_keys = [
        "transmission", "substations", "power_plants",
        "natgas_pipelines", "fema_flood_zones", "usfws_wetlands",
    ]
    if layers:
        keys = [k.strip() for k in layers.split(",") if k.strip() in LIVE_LAYER_REGISTRY]
    else:
        keys = [k for k in default_keys if k in LIVE_LAYER_REGISTRY]

    report: list[dict] = []
    for key in keys:
        cfg = LIVE_LAYER_REGISTRY[key]
        t0 = _time.perf_counter()
        out = siting_proxy(key, bbox=bbox, limit=limit, state=st)
        elapsed_ms = int((_time.perf_counter() - t0) * 1000)
        if isinstance(out, JSONResponse):
            report.append({
                "key": key, "name": cfg["name"], "group": cfg["group"],
                "source": cfg["source"], "ok": False,
                "error": f"HTTP {out.status_code}",
                "elapsed_ms": elapsed_ms,
            })
            continue
        meta = out.get("_meta") or {}
        returned = len(out.get("features", []))
        cap = int(cfg.get("max_records", 4000))
        # Confidence heuristics: multi-source > single, near-cap = saturated, 0 = gap
        if returned == 0:
            confidence = "gap"
        elif returned >= cap * 0.95 or meta.get("truncated"):
            confidence = "saturated"
        elif int(meta.get("source_count", 1)) > 1:
            confidence = "multi-source"
        else:
            confidence = "ok"
        report.append({
            "key": key,
            "name": cfg["name"],
            "group": cfg["group"],
            "source": cfg["source"],
            "ok": True,
            "returned": returned,
            "limit": meta.get("limit"),
            "truncated": bool(meta.get("truncated")),
            "source_count": int(meta.get("source_count", 1)),
            "source_breakdown": meta.get("source_breakdown") or {},
            "elapsed_ms": elapsed_ms,
            "confidence": confidence,
        })

    live_count = sum(1 for r in report if r.get("ok") and (r.get("returned") or 0) > 0)
    return {
        "state": st,
        "region_bbox": bbox,
        "generated_ms_total": sum(r.get("elapsed_ms", 0) for r in report),
        "layers_total": len(report),
        "layers_with_data": live_count,
        "queue": _queue_freshness_snapshot(st),
        "layers": report,
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
        ("substations",      "Nearest substation"),
        ("fiber_lines",      "Nearest fiber optic cable"),
    ]
    out: dict = {"lat": lat, "lon": lon, "radius_mi": radius_mi, "results": []}
    for key, label in targets:
        cfg = LIVE_LAYER_REGISTRY.get(key)
        if not cfg:
            continue
        # Internal (non-ArcGIS) layers \u2014 dispatch to their in-process handler
        # and treat the returned FeatureCollection the same way as ArcGIS output.
        if cfg.get("internal"):
            if key == "fiber_lines":
                data = _fiber_lines_fc(bbox, limit=2000, state=None)
                if isinstance(data, JSONResponse):
                    data = {}
            else:
                data = {}
        else:
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


# ---------------------------------------------------------------------------
# Parcel attribute lookup (NC OneMap) + public-data enrichment
# ---------------------------------------------------------------------------

# Census Geocoder — returns county/state/tract/block for any CONUS point.
_CENSUS_GEOCODER = (
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
)

# FEMA National Flood Hazard Layer — flood-zone lookup at point.
_FEMA_NFHL = (
    "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query"
)

# USGS National Structures (schools/hospitals/gov) — richer optional enrichment.
# (Kept for future; not hit here to bound latency.)


@app.get("/api/siting/parcel_attrs")
def siting_parcel_attrs(lat: float, lon: float, state: str | None = None):
    """Return the parcel record at (lat,lon) plus public-data enrichment.

    - State-aware parcel attribute lookup (NC, SC-York, FL, IN, OH, KY-Jefferson)
    - US Census Bureau: county / FIPS / tract / block
    - FEMA NFHL: 100-yr floodplain zone at the point

    All three calls are best-effort; partial data is returned on failure so
    the UI always gets a populated popup rather than a blank error.
    """
    import requests as _rq

    result: dict = {"lat": lat, "lon": lon, "sources": []}

    # 1) Parcel attributes — pick the right layer for the active state, or
    # fall back to NC for backward compatibility.
    parcel_key = STATE_PARCEL_LAYER.get((state or "").upper().strip(), "nc_parcels")
    parcel_cfg = LIVE_LAYER_REGISTRY.get(parcel_key)
    if parcel_cfg:
        from urllib.parse import urlencode
        params = {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "outSR": 4326,
            "inSR": 4326,
            "geometryType": "esriGeometryPoint",
            "geometry": f"{lon},{lat}",
            "spatialRel": "esriSpatialRelIntersects",
            "returnGeometry": "false",
            "resultRecordCount": 1,
        }
        url = parcel_cfg["url"] + "/query?" + urlencode(params)
        try:
            r = _rq.get(url, timeout=15)
            if r.status_code == 200:
                data = r.json()
                feats = data.get("features") or []
                if feats:
                    result["parcel"] = feats[0].get("properties") or {}
                    result["sources"].append(parcel_cfg.get("source", parcel_key))
        except Exception as e:
            result["parcel_error"] = str(e)

    # 2) Census Geocoder — county / tract / block
    try:
        r = _rq.get(
            _CENSUS_GEOCODER,
            params={
                "x": lon, "y": lat,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "format": "json",
            },
            timeout=15,
        )
        if r.status_code == 200:
            g = r.json().get("result", {}).get("geographies", {}) or {}
            counties = g.get("Counties") or []
            tracts = g.get("Census Tracts") or []
            blocks = g.get("2020 Census Blocks") or g.get("Census Blocks") or []
            result["census"] = {
                "county": counties[0].get("NAME") if counties else None,
                "state": counties[0].get("STATE") if counties else None,
                "county_fips": counties[0].get("GEOID") if counties else None,
                "tract_fips": tracts[0].get("GEOID") if tracts else None,
                "block_fips": blocks[0].get("GEOID") if blocks else None,
            }
            result["sources"].append("US Census Bureau")
    except Exception as e:
        result["census_error"] = str(e)

    # 3) FEMA flood zone
    try:
        from urllib.parse import urlencode
        params = {
            "where": "1=1",
            "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
            "f": "json",
            "geometryType": "esriGeometryPoint",
            "geometry": f"{lon},{lat}",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "returnGeometry": "false",
            "resultRecordCount": 1,
        }
        r = _rq.get(_FEMA_NFHL + "?" + urlencode(params), timeout=15)
        if r.status_code == 200:
            feats = r.json().get("features") or []
            if feats:
                attrs = feats[0].get("attributes") or {}
                zone = attrs.get("FLD_ZONE")
                result["flood"] = {
                    "zone": zone,
                    "subtype": attrs.get("ZONE_SUBTY"),
                    "in_special_flood_hazard_area": (attrs.get("SFHA_TF") == "T"),
                }
                result["sources"].append("FEMA NFHL")
            else:
                result["flood"] = {"zone": "X (outside mapped SFHA)", "in_special_flood_hazard_area": False}
                result["sources"].append("FEMA NFHL")
    except Exception as e:
        result["flood_error"] = str(e)

    # 4) Substation intersection — if this parcel contains (or is directly
    # adjacent to) a known HIFLD substation, surface the upstream attributes
    # so the popup can show owner / voltage / capacity / status without the
    # user having to turn the substations layer on first.
    try:
        from urllib.parse import urlencode
        sub_cfg = LIVE_LAYER_REGISTRY.get("substations") or {}
        # Walk every configured source URL so flaky upstream hosts don't
        # silently drop the enrichment.
        sub_sources = sub_cfg.get("source_urls") or ([sub_cfg["url"]] if sub_cfg.get("url") else [])
        # ~500m search radius; substations are point features so we buffer the
        # click point and use intersects. 0.005 deg \u2248 555m at equator.
        deg = 0.005
        sub_bbox = f"{lon - deg},{lat - deg},{lon + deg},{lat + deg}"
        sub_hit: dict | None = None
        for src_url in sub_sources:
            params = {
                "where": "1=1",
                "outFields": "*",
                "f": "geojson",
                "outSR": 4326,
                "inSR": 4326,
                "geometryType": "esriGeometryEnvelope",
                "geometry": sub_bbox,
                "spatialRel": "esriSpatialRelIntersects",
                "returnGeometry": "true",
                "resultRecordCount": 25,
            }
            url = src_url + "/query?" + urlencode(params)
            try:
                r = _resilient_get(url, timeout=15, retries=2)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            feats = data.get("features") or []
            if not feats:
                continue
            # Pick the closest substation by point distance.
            from math import sqrt as _sqrt
            best = None
            best_d = None
            for f in feats:
                g = f.get("geometry") or {}
                coords = g.get("coordinates") or []
                if len(coords) < 2:
                    continue
                dx = coords[0] - lon
                dy = coords[1] - lat
                d = _sqrt(dx * dx + dy * dy)
                if best_d is None or d < best_d:
                    best_d = d
                    best = f
            if best is not None:
                sub_hit = best
                break
        if sub_hit:
            props = sub_hit.get("properties") or {}
            # Present a subset of fields tuned for popup readability.
            result["substation"] = {
                "id": props.get("ID") or props.get("OBJECTID"),
                "name": props.get("NAME"),
                "owner": props.get("OWNER") or props.get("COMPANY"),
                "operator": props.get("OPERATOR"),
                "type": props.get("TYPE"),
                "status": props.get("STATUS") or props.get("OP_STATUS"),
                "max_voltage_kv": props.get("MAX_VOLT") or props.get("MAX_VOLTAGE") or props.get("VOLTAGE"),
                "min_voltage_kv": props.get("MIN_VOLT") or props.get("MIN_VOLTAGE"),
                "lines_in": props.get("LINES") or props.get("LINES_IN"),
                "source": props.get("SOURCE"),
                "source_date": props.get("SOURCEDATE"),
                "county": props.get("COUNTY"),
                "state": props.get("STATE"),
                "all_fields": props,
            }
            result["sources"].append("HIFLD Substations")
    except Exception as e:
        result["substation_error"] = str(e)

    return result
