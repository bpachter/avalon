/// <reference types="vite/client" />

// In production, VITE_API_BASE is set to the Railway backend URL.
// In dev, requests proxy through Vite to http://localhost:8000.
const BASE = import.meta.env.VITE_API_BASE ?? ''

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error && e.name === 'AbortError') return true
  return false
}

async function parseJsonOrThrow<T>(r: Response, label: string): Promise<T> {
  const body = await r.text()
  if (!r.ok) throw new Error(`${label} ${r.status}: ${body.slice(0, 200)}`)
  try { return JSON.parse(body) as T }
  catch { throw new Error(`${label}: non-JSON response. Head: ${body.slice(0, 120)}`) }
}

async function fetchJson<T>(url: string, label: string, init?: RequestInit, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await parseJsonOrThrow<T>(await fetch(url, init), label)
    } catch (e) {
      // Caller cancelled — don't retry, surface the abort immediately.
      if (init?.signal?.aborted || isAbortError(e)) throw e
      if (i === attempts - 1) throw e
      await delay(120 * (i + 1))
    }
  }
  throw new Error(`${label}: exhausted ${attempts} attempts`)
}

// ─── Types ────────────────────────────────────────────────────────────────

export type Archetype = 'training' | 'inference' | 'mixed'

export interface FactorResultDTO {
  factor: string
  raw_value: number | null
  normalized: number
  weight: number
  weighted: number
  killed: boolean
  stub?: boolean
  provenance: Record<string, unknown>
}

export interface SiteResultDTO {
  site_id: string
  lat: number
  lon: number
  composite: number
  factors: Record<string, FactorResultDTO>
  kill_flags: Record<string, boolean>
  imputed: string[]
  provenance: Record<string, unknown>
  extras?: Record<string, unknown>
}

export interface SitingFactorsResponse {
  factors: string[]
  default_archetype: Archetype
  weights: Record<Archetype, Record<string, number>>
  kill_criteria: Record<string, unknown>
}

export interface LiveLayer {
  key: string
  name: string
  group: string
  geom: 'point' | 'line' | 'polygon'
  color: string
  style?: string | null
  min_zoom: number
  source: string
  state?: string | null
}

export interface StateOption {
  code: string
  bbox: [number, number, number, number]
  duke: boolean
}

export interface MoratoriumCounty {
  state: string
  county: string
  status: string
  url: string
}

export interface ParcelDetailResult {
  layer: string
  label: string
  distance_mi: number | null
  properties: Record<string, unknown>
}

export interface ParcelDetail {
  lat: number
  lon: number
  radius_mi: number
  results: ParcelDetailResult[]
}

export interface ParcelAttrs {
  lat: number
  lon: number
  sources: string[]
  parcel?: Record<string, unknown>
  census?: {
    county?: string | null
    state?: string | null
    county_fips?: string | null
    tract_fips?: string | null
    block_fips?: string | null
  }
  flood?: {
    zone?: string | null
    subtype?: string | null
    in_special_flood_hazard_area?: boolean
  }
  substation?: {
    id?: unknown
    name?: string | null
    owner?: string | null
    operator?: string | null
    type?: string | null
    status?: string | null
    max_voltage_kv?: number | string | null
    min_voltage_kv?: number | string | null
    lines_in?: number | string | null
    source?: string | null
    source_date?: string | null
    county?: string | null
    state?: string | null
    all_fields?: Record<string, unknown>
  }
  parcel_error?: string
  census_error?: string
  flood_error?: string
  substation_error?: string
}

// ─── API calls ────────────────────────────────────────────────────────────

export async function fetchSitingFactors(signal?: AbortSignal): Promise<SitingFactorsResponse> {
  return fetchJson(`${BASE}/api/siting/factors`, 'siting/factors', { signal })
}

export async function fetchSitingSample(state?: string, count = 80, signal?: AbortSignal): Promise<{
  results?: SiteResultDTO[]
  sites?: Array<{ site_id: string; lat: number; lon: number; [k: string]: unknown }>
  stub_coverage?: Record<string, number>
  state?: string
  count?: number
}> {
  const params = new URLSearchParams({ count: String(count) })
  if (state) params.set('state', state)
  return fetchJson(`${BASE}/api/siting/sample?${params}`, 'siting/sample', { signal })
}

export async function scoreSites(payload: {
  sites: Array<{ site_id: string; lat: number; lon: number; [k: string]: unknown }>
  archetype?: Archetype
  weight_overrides?: Record<string, number>
}, signal?: AbortSignal): Promise<{ results: SiteResultDTO[]; stub_coverage?: Record<string, number> }> {
  return fetchJson(
    `${BASE}/api/siting/score`, 'siting/score',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal },
  )
}

export async function fetchSitingLiveLayers(signal?: AbortSignal): Promise<{ layers: LiveLayer[] }> {
  return fetchJson(`${BASE}/api/siting/live_layers`, 'siting/live_layers', { signal })
}

export async function fetchSitingProxyGeoJSON(
  layerKey: string,
  bbox: [number, number, number, number],
  limit = 8000,
  state?: string | null,
  zoom?: number | null,
  signal?: AbortSignal,
): Promise<{ type: 'FeatureCollection'; features: unknown[]; _meta: Record<string, unknown> } | { error: string }> {
  const params = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit) })
  if (state) params.set('state', state)
  if (zoom != null && Number.isFinite(zoom)) params.set('zoom', zoom.toFixed(2))

  // ── Client-side LRU cache ──────────────────────────────────────────
  // The backend already snaps the bbox into a quantised cache key, so
  // small pans / re-toggles within the same zoom band collapse to one
  // upstream request. Mirroring that on the client means we don't even
  // hit the network for those cases — the pan feels instant.
  const qbbox = _quantizeBboxForCache(bbox, zoom ?? null)
  const cacheKey = `${layerKey}|${qbbox}|${limit}|${(state ?? '').toUpperCase()}|${_zoomBand(zoom ?? null)}`
  const cached = _proxyClientCache.get(cacheKey)
  if (cached && (performance.now() - cached.t) < CLIENT_CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const r = await fetch(`${BASE}/api/siting/proxy/${layerKey}?${params}`, { signal })
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    const data = await parseJsonOrThrow(r, `siting/proxy/${layerKey}`) as
      | { type: 'FeatureCollection'; features: unknown[]; _meta: Record<string, unknown> }
      | { error: string }
    // Don't cache transient upstream warnings or server-shaped errors —
    // they'd otherwise stick on the client for up to CLIENT_CACHE_TTL_MS,
    // turning a 5-second blip into minutes of broken data on screen.
    const isError = 'error' in data
    const hasWarning = !isError && Boolean(
      (data as { _meta?: { warning?: unknown } })._meta?.warning,
    )
    if (!isError && !hasWarning) _proxyClientCachePut(cacheKey, data)
    return data
  } catch (e) {
    if (isAbortError(e)) throw e
    return { error: String(e) }
  }
}

// ── Proxy LRU helpers (kept local to api.ts so SitingPanel stays UI-only) ──
const CLIENT_CACHE_TTL_MS = 4 * 60 * 1000   // backend TTL is 5min — undershoot
const CLIENT_CACHE_MAX = 200
type _CacheEntry = { t: number; data: { type: 'FeatureCollection'; features: unknown[]; _meta: Record<string, unknown> } | { error: string } }
const _proxyClientCache: Map<string, _CacheEntry> = new Map()

function _zoomBand(zoom: number | null): number {
  if (zoom == null) return -1
  if (zoom < 5)  return 4
  if (zoom < 7)  return 6
  if (zoom < 9)  return 8
  if (zoom < 11) return 10
  if (zoom < 13) return 12
  if (zoom < 15) return 14
  return 16
}

function _quantizeBboxForCache(b: [number, number, number, number], zoom: number | null): string {
  const band = _zoomBand(zoom)
  const step =
    band === 4  ? 0.5    :
    band === 6  ? 0.2    :
    band === 8  ? 0.05   :
    band === 10 ? 0.02   :
    band === 12 ? 0.005  :
    band === 14 ? 0.001  :
    band === 16 ? 0.0003 :
                  0.01
  return b.map(v => (Math.round(v / step) * step).toFixed(5)).join(',')
}

function _proxyClientCachePut(key: string, data: _CacheEntry['data']) {
  if (_proxyClientCache.size >= CLIENT_CACHE_MAX) {
    // Map preserves insertion order; drop the oldest 25%.
    const drop = Math.floor(CLIENT_CACHE_MAX / 4)
    let i = 0
    for (const k of _proxyClientCache.keys()) {
      _proxyClientCache.delete(k)
      if (++i >= drop) break
    }
  }
  _proxyClientCache.set(key, { t: performance.now(), data })
}

export async function fetchSitingStates(signal?: AbortSignal): Promise<{ states: StateOption[]; duke_states: string[] }> {
  return fetchJson(`${BASE}/api/siting/states`, 'siting/states', { signal })
}

export async function fetchSitingStateBoundaries(
  dukeOnly = false,
  signal?: AbortSignal,
): Promise<{ type: 'FeatureCollection'; features: Array<Record<string, unknown>>; _meta?: Record<string, unknown> }> {
  const params = new URLSearchParams()
  if (dukeOnly) params.set('duke_only', 'true')
  const suffix = params.toString() ? `?${params}` : ''
  return fetchJson(`${BASE}/api/siting/state_boundaries${suffix}`, 'siting/state_boundaries', { signal })
}

export async function fetchSitingMoratoriums(signal?: AbortSignal): Promise<{ counties: MoratoriumCounty[] }> {
  return fetchJson(`${BASE}/api/siting/moratoriums`, 'siting/moratoriums', { signal })
}

export interface CoverageLayer {
  key: string
  name: string
  group: string
  source: string
  ok: boolean
  returned?: number | null
  limit?: number | null
  truncated?: boolean
  source_count?: number
  source_breakdown?: Record<string, number>
  elapsed_ms?: number
  confidence?: 'gap' | 'saturated' | 'multi-source' | 'ok'
  error?: string
}

export interface CoverageReport {
  state: string
  region_bbox: string
  generated_ms_total: number
  layers_total: number
  layers_with_data: number
  queue?: {
    ok: boolean
    cache?: { cached?: boolean; path?: string | null; projects?: number }
    provenance?: { source?: string; as_of?: string; path?: string }
    projects?: number
    geocoded_projects?: number
    iso_counts?: Record<string, number>
    state_metrics?: Record<string, unknown> | null
    error?: string
  }
  layers: CoverageLayer[]
}

export async function fetchSitingCoverage(state: string, layers?: string[], limit = 1500, signal?: AbortSignal): Promise<CoverageReport | { error: string }> {
  const params = new URLSearchParams({ state, limit: String(limit) })
  if (layers && layers.length) params.set('layers', layers.join(','))
  try {
    const r = await fetch(`${BASE}/api/siting/qa/coverage?${params}`, { signal })
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow<CoverageReport>(r, 'siting/qa/coverage')
  } catch (e) {
    if (isAbortError(e)) throw e
    return { error: String(e) }
  }
}

export async function fetchParcelDetail(
  lat: number, lon: number, radius_mi = 5, signal?: AbortSignal,
): Promise<ParcelDetail | { error: string }> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius_mi: String(radius_mi) })
  try {
    const r = await fetch(`${BASE}/api/siting/parcel_detail?${params}`, { signal })
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow<ParcelDetail>(r, 'siting/parcel_detail')
  } catch (e) {
    if (isAbortError(e)) throw e
    return { error: String(e) }
  }
}

export async function fetchParcelAttrs(
  lat: number, lon: number, state?: string, signal?: AbortSignal,
): Promise<ParcelAttrs | { error: string }> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  if (state) params.set('state', state)
  try {
    const r = await fetch(`${BASE}/api/siting/parcel_attrs?${params}`, { signal })
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow<ParcelAttrs>(r, 'siting/parcel_attrs')
  } catch (e) {
    if (isAbortError(e)) throw e
    return { error: String(e) }
  }
}

// ─── AI Analysis ──────────────────────────────────────────────────────────

export interface AiAnalysisResponse {
  site_id: string
  narratives: Record<string, string>  // factor_name -> narrative text, plus "overall_summary"
}

export async function requestAiAnalysis(payload: {
  site_id: string
  lat: number
  lon: number
  state?: string
  composite?: number
  factors: Record<string, { provenance?: Record<string, unknown>; [k: string]: unknown }>
  model?: string
}, signal?: AbortSignal): Promise<AiAnalysisResponse | { error: string }> {
  try {
    const r = await fetch(`${BASE}/api/siting/ai-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow<AiAnalysisResponse>(r, 'siting/ai-analysis')
  } catch (e) {
    if (isAbortError(e)) throw e
    return { error: String(e) }
  }
}
