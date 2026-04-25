"""AI-powered site analysis narratives via Gandalf (Ollama / local Gemma4 26B).

Requires OLLAMA_URL pointing at the Gandalf gateway (Railway) or a local Ollama
instance (default: http://localhost:11434).  Set OLLAMA_MODEL to override the
model (default: gemma4:26b).

On Railway: set OLLAMA_URL=https://your-gandalf-gateway.up.railway.app so
requests are forwarded through the Cloudflare tunnel to your home RTX 4090.
"""
from __future__ import annotations

import os
import json
import logging
import asyncio
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:26b")

# ---------------------------------------------------------------------------
# Per-factor prompt templates
# ---------------------------------------------------------------------------

_SYSTEM = (
    "You are a senior site-selection consultant specializing in hyperscale and "
    "enterprise data center siting. You write concise, technically precise, "
    "financially grounded site narratives. Avoid jargon without context. "
    "Use plain USD figures with M/B suffixes. Keep each response to 3-5 sentences "
    "unless instructed otherwise. Be direct and opinionated — do not hedge everything."
)

_FACTOR_PROMPTS: dict[str, str] = {

    "power_transmission": """\
Analyze the power transmission access for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W
in {state}.

Provenance data:
{provenance_json}

Write a 3-5 sentence narrative covering:
1. The nearest ≥230 kV transmission line (distance, voltage class, owner, and which substations it connects).
2. Whether a direct tap or a spur to an existing substation is more likely viable.
3. Estimated interconnection cost range (tap line + new substation) and what drives variance.
4. Substation headroom quality (name, lines, max voltage) and whether upgrading vs. building new makes sense.
5. An overall transmission access verdict (excellent / good / marginal / poor) with one-line rationale.
If the cache data is missing or a field is null, note that live HIFLD data is not yet cached and provide
context based on the geographic region instead.""",

    "gas_pipeline": """\
Analyze the natural gas pipeline access for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W
in {state}.

Provenance data:
{provenance_json}

Write a 3-5 sentence narrative covering:
1. Nearest interstate or intrastate pipeline (name, operator, pipe type, diameter if known).
2. Distance to the nearest tap point and the estimated lateral construction cost range.
3. Whether the pipeline diameter and pressure class support behind-the-meter peaking turbines
   at the scale needed for a large AI data center (50-500 MW campus).
4. An overall gas access verdict (excellent / good / marginal / poor) with one-line rationale.
Note that proximity to gas is increasingly strategic for AI-workload hyperscalers deploying
behind-the-meter generation.""",

    "fiber": """\
Analyze the long-haul fiber and network access for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W
in {state}.

Provenance data:
{provenance_json}

Write a 3-5 sentence narrative covering:
1. Distance to nearest long-haul fiber route and what that implies for on-net / off-net reach.
2. Route diversity risk — is a single carrier likely, or does the area support multi-path redundancy?
3. Nearest internet exchange point if known, and its relevance to latency-sensitive workloads.
4. An overall connectivity verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "water": """\
Analyze the water availability and risk for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W
in {state}.

Provenance data:
{provenance_json}

Write a 3-5 sentence narrative covering:
1. Regional water stress context (drought trends, aquifer stress, state regulatory environment).
2. Feasibility of large-volume water rights for evaporative cooling at hyperscale (5-10M gal/day).
3. Whether reclaimed water / closed-loop / air-cooled alternatives should be prioritized given local risk.
4. An overall water access verdict (excellent / good / marginal / poor) with one-line rationale.
This is a geographic proxy assessment — note when live USGS/NOAA data would improve confidence.""",

    "land_zoning": """\
Analyze the land availability and zoning environment for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W
in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. State-level regulatory / zoning environment for large industrial and data center uses.
2. Relative availability of industrial or flex-use parcels at 100-500 acre scale in this region.
3. Whether greenfield, brownfield, or adaptive reuse strategies are most viable here.
4. An overall land/zoning verdict (excellent / good / marginal / poor) with one-line rationale.
Note this is a state-level proxy — a county-level parcel analysis would sharpen confidence.""",

    "permitting": """\
Analyze the permitting climate for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. State regulatory posture for large-scale data center development (CEQA equivalents, environmental review).
2. Known risks: moratoria, opposition precedents, interconnection queue friction in this ISO/RTO region.
3. Typical entitlement timeline for a comparable project in this state (best case / worst case).
4. An overall permitting verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "community": """\
Analyze the community reception and opposition risk for a proposed data center site at
{lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. State and regional track record for data center community acceptance.
2. Noise, water use, and jobs/tax-revenue calculus that will dominate local discourse.
3. Known opposition patterns or activist groups active in this state/region.
4. Recommended community engagement strategy (proactive incentive structure, jobs commitments, etc.).
5. An overall community reception verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "power_cost": """\
Analyze the power cost environment for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Industrial electricity cost ($/kWh) in context — how it compares to the national range (low ~$0.04, high ~$0.12).
2. Utility rate structure: whether TOU, demand charges, or large-load special contracts are typical here.
3. PPA opportunity: is this region favorable for long-term renewable PPA procurement at competitive rates?
4. An overall power cost verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "power_carbon": """\
Analyze the grid carbon intensity for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Current grid CO₂ intensity (gCO₂/kWh) and its trend direction.
2. Balancing authority / eGRID subregion context — is the region cleaning up fast or stagnant?
3. Impact on achieving corporate net-zero / RE100 pledges and additionality requirements.
4. An overall carbon verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "climate": """\
Analyze the climate suitability for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Cooling efficiency: average wet-bulb temperatures and free-cooling hours per year.
2. Extreme weather risk: hurricane tracks, tornado corridors, ice storms relevant to this geography.
3. PUE impact: how climate affects annual average Power Usage Effectiveness vs. a neutral 1.2 baseline.
4. An overall climate verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "hazard": """\
Analyze the natural hazard profile for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Primary hazard risks: earthquake (USGS seismic zone), flood (FEMA zone), wind (hurricane/tornado corridor).
2. Insurance cost implications and typical commercial property risk multipliers in this region.
3. Resilience engineering implications: whether N+1 or 2N redundancy is sufficient or if additional
   hardening (blast doors, flood barriers) would be required.
4. An overall hazard verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "labor": """\
Analyze the labor market for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Availability of skilled data center operations staff (electricians, mechanical engineers, NOC technicians).
2. Regional tech talent pipeline: nearby universities, existing hyperscaler footprint as a labor signal.
3. Wage pressure: is this a high-wage coastal tech hub or a lower-cost interior market?
4. An overall labor verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "latency": """\
Analyze the network latency profile for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. Distance to the nearest major population center and implied round-trip latency (<10ms / <20ms / >20ms).
2. Relevance to latency-sensitive workloads: inference serving, financial applications, CDN edge.
3. Whether this site is better suited for training/batch AI workloads vs. latency-constrained inference.
4. An overall latency verdict (excellent / good / marginal / poor) with one-line rationale.""",

    "tax_incentives": """\
Analyze the tax incentive landscape for a proposed data center site at {lat:.4f}°N, {lon:.4f}°W in {state}.

Provenance data:
{provenance_json}

Write 3-5 sentences covering:
1. State-level data center tax incentives: sales tax exemptions on equipment, property tax abatements.
2. Federal IRA/CHIPS Act manufacturing zone eligibility if applicable.
3. Estimated NPV impact of incentives over a 10-year hold on a $500M facility build-out.
4. An overall tax incentive verdict (excellent / good / marginal / poor) with one-line rationale.""",
}

_OVERALL_SUMMARY_PROMPT = """\
You are writing a C-suite site selection brief for a proposed data center at {lat:.4f}°N, {lon:.4f}°W
in {state}. Composite score: {composite:.2f}/10.

Per-factor narratives:
{narratives_text}

Write a 5-7 sentence executive summary that:
1. Leads with the overall site quality verdict and composite score.
2. Highlights the 2-3 strongest factors driving the score.
3. Identifies the 1-2 most material risks or constraints.
4. Provides a one-line investment recommendation (proceed / proceed with conditions / defer / avoid).
Be direct, financially grounded, and avoid redundancy with the factor-level narratives."""


# ---------------------------------------------------------------------------
# Main async function
# ---------------------------------------------------------------------------

async def generate_site_analysis(
    *,
    site_id: str,
    lat: float,
    lon: float,
    state: str,
    composite: float,
    factors: dict[str, dict[str, Any]],
    model: str | None = None,
) -> dict[str, str]:
    """Generate AI narratives for all factors + an overall summary via Gandalf.

    Returns a dict with keys being factor names (+ "overall_summary").
    On failure (Gandalf offline, tunnel down), returns error placeholder strings.
    """
    return await _generate_ollama(
        site_id=site_id, lat=lat, lon=lon, state=state,
        composite=composite, factors=factors, model=model,
    )


# ── Ollama backend ─────────────────────────────────────────────────────────

async def _ollama_chat(messages: list[dict], model: str, temperature: float, max_tokens: int) -> str:
    """Call Ollama /api/chat and return the assistant content string."""
    # The Gandalf gateway proxies /api/* → GPU. Ollama's /api/chat maps directly.
    url = f"{_OLLAMA_URL}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    async with httpx.AsyncClient(timeout=120.0, verify=False) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def _generate_ollama(
    *, site_id: str, lat: float, lon: float, state: str,
    composite: float, factors: dict[str, dict[str, Any]], model: str | None,
) -> dict[str, str]:
    used_model = model or _OLLAMA_MODEL
    narratives: dict[str, str] = {}

    async def _analyze_factor(factor_name: str, factor_data: dict) -> tuple[str, str]:
        prompt_template = _FACTOR_PROMPTS.get(factor_name)
        if not prompt_template:
            return factor_name, f"[No AI template available for factor: {factor_name}]"
        prov = {
            k: v for k, v in (factor_data.get("provenance") or {}).items()
            if k not in {"cache_path", "stub"} and v is not None
        }
        user_msg = prompt_template.format(
            lat=lat, lon=lon,
            state=state or "Unknown",
            provenance_json=json.dumps(prov, indent=2),
        )
        try:
            text = await _ollama_chat(
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                model=used_model,
                temperature=0.4,
                max_tokens=400,
            )
            return factor_name, text
        except Exception as exc:
            logger.warning("Ollama error for factor %s: %s", factor_name, exc)
            return factor_name, f"[Analysis generation failed: {exc}]"

    # Run all factor analyses concurrently
    tasks = [_analyze_factor(name, data) for name, data in factors.items()]
    results = await asyncio.gather(*tasks)
    for name, text in results:
        narratives[name] = text

    # Overall summary
    narratives_text = "\n\n".join(
        f"**{k.upper().replace('_', ' ')}**: {v}"
        for k, v in narratives.items()
        if not v.startswith("[")
    )
    overall_prompt = _OVERALL_SUMMARY_PROMPT.format(
        lat=lat, lon=lon,
        state=state or "Unknown",
        composite=composite,
        narratives_text=narratives_text or "(no factor narratives available)",
    )
    try:
        text = await _ollama_chat(
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": overall_prompt},
            ],
            model=used_model,
            temperature=0.3,
            max_tokens=600,
        )
        narratives["overall_summary"] = text
    except Exception as exc:
        logger.warning("Ollama error for overall summary: %s", exc)
        narratives["overall_summary"] = f"[Summary generation failed: {exc}]"

    return narratives


