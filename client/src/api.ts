/// <reference types="vite/client" />

// In production, VITE_API_BASE is set to the Railway backend URL.
// In dev, requests proxy through Vite to http://localhost:8000.
const BASE = import.meta.env.VITE_API_BASE ?? ''

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
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

// ─── API calls ────────────────────────────────────────────────────────────

export async function fetchSitingFactors(): Promise<SitingFactorsResponse> {
  return fetchJson(`${BASE}/api/siting/factors`, 'siting/factors')
}

export async function fetchSitingSample(): Promise<{
  results?: SiteResultDTO[]
  sites?: Array<{ site_id: string; lat: number; lon: number; [k: string]: unknown }>
}> {
  return fetchJson(`${BASE}/api/siting/sample`, 'siting/sample')
}

export async function scoreSites(payload: {
  sites: Array<{ site_id: string; lat: number; lon: number; [k: string]: unknown }>
  archetype?: Archetype
  weight_overrides?: Record<string, number>
}): Promise<{ results: SiteResultDTO[] }> {
  return fetchJson(
    `${BASE}/api/siting/score`, 'siting/score',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  )
}

export async function fetchSitingLiveLayers(): Promise<{ layers: LiveLayer[] }> {
  return fetchJson(`${BASE}/api/siting/live_layers`, 'siting/live_layers')
}

export async function fetchSitingProxyGeoJSON(
  layerKey: string,
  bbox: [number, number, number, number],
  limit = 8000,
  state?: string | null,
): Promise<{ type: 'FeatureCollection'; features: unknown[]; _meta: Record<string, unknown> } | { error: string }> {
  const params = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit) })
  if (state) params.set('state', state)
  try {
    const r = await fetch(`${BASE}/api/siting/proxy/${layerKey}?${params}`)
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow(r, `siting/proxy/${layerKey}`)
  } catch (e) {
    return { error: String(e) }
  }
}

export async function fetchSitingStates(): Promise<{ states: StateOption[]; duke_states: string[] }> {
  return fetchJson(`${BASE}/api/siting/states`, 'siting/states')
}

export async function fetchSitingMoratoriums(): Promise<{ counties: MoratoriumCounty[] }> {
  return fetchJson(`${BASE}/api/siting/moratoriums`, 'siting/moratoriums')
}

export async function fetchParcelDetail(
  lat: number, lon: number, radius_mi = 5,
): Promise<ParcelDetail | { error: string }> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius_mi: String(radius_mi) })
  try {
    const r = await fetch(`${BASE}/api/siting/parcel_detail?${params}`)
    if (!r.ok) {
      let j: { error?: string } = {}
      try { j = await r.json() } catch { /* ignore */ }
      return { error: j.error ?? `HTTP ${r.status}` }
    }
    return await parseJsonOrThrow<ParcelDetail>(r, 'siting/parcel_detail')
  } catch (e) {
    return { error: String(e) }
  }
}
