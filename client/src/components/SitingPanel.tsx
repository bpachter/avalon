import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import maplibregl, { Map as MLMap } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MUI primitives — used for the panel chrome (controls, sliders, switches,
// list rows). Map + legend + parcel popup remain hand-rolled because
// MapLibre overlays render outside React anyway.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import Switch from '@mui/material/Switch'
import Slider from '@mui/material/Slider'
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import RefreshIcon from '@mui/icons-material/Refresh'
import { avalonPalette } from '../theme'
import SiteDetailsModal from './SiteDetailsModal'
import {
  fetchSitingFactors,
  fetchSitingSample,
  fetchSitingLiveLayers,
  fetchSitingProxyGeoJSON,
  fetchSitingStates,
  fetchSitingMoratoriums,
  fetchSitingCoverage,
  fetchParcelDetail,
  fetchParcelAttrs,
  scoreSites,
  type Archetype,
  type LiveLayer,
  type SiteResultDTO,
  type SitingFactorsResponse,
  type StateOption,
  type MoratoriumCounty,
  type ParcelDetail,
  type ParcelAttrs,
  type CoverageReport,
} from '../api'
import './SitingPanel.css'

// Free MapLibre styles — no API key required
const STYLE_DARK =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const STYLE_VOYAGER =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
const STYLE_POSITRON =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

function _rasterStyle(
  id: string,
  tileTemplates: string[],
  attribution: string,
  maxzoom = 19,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://fonts.cartocdn.com/gl/{fontstack}/{range}.pbf',
    sources: {
      [id]: {
        type: 'raster',
        tiles: tileTemplates,
        tileSize: 256,
        maxzoom,
        attribution,
      },
    },
    layers: [{ id, type: 'raster', source: id }],
  }
}

// USGS National Map satellite imagery — free, government-hosted, no API key required.
// Replaces ESRI arcgisonline.com which ERR_CONNECTION_RESETs from GitHub Pages.
const STYLE_SATELLITE: maplibregl.StyleSpecification = _rasterStyle(
  'satellite',
  ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
  'Tiles courtesy of the U.S. Geological Survey',
  16,
)

// Hybrid satellite + roads/labels. Uses USGS imagery (government-hosted,
// reliable) with a CARTO labels-only overlay. Replaces the previous
// ESRI arcgisonline.com stack which was returning ERR_CONNECTION_RESET
// for Reference/World_Boundaries_and_Places + Reference/World_Transportation
// tiles intermittently from GitHub Pages.
const STYLE_HYBRID: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://fonts.cartocdn.com/gl/{fontstack}/{range}.pbf',
  sources: {
    'usgs-imagery': {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Tiles courtesy of the U.S. Geological Survey',
    },
    'carto-labels': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '\u00a9 OpenStreetMap, \u00a9 CARTO',
    },
  },
  layers: [
    { id: 'usgs-imagery-lyr', type: 'raster', source: 'usgs-imagery' },
    { id: 'carto-labels-lyr', type: 'raster', source: 'carto-labels' },
  ],
}

// USGS National Map topographic.
const STYLE_TOPO: maplibregl.StyleSpecification = _rasterStyle(
  'topo',
  ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
  'Tiles courtesy of the U.S. Geological Survey',
  16,
)

// OpenStreetMap raster (OSM standard tiles).
const STYLE_OSM: maplibregl.StyleSpecification = _rasterStyle(
  'osm',
  [
    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  ],
  '© OpenStreetMap contributors',
  19,
)

type BasemapKey = 'dark' | 'voyager' | 'positron' | 'satellite' | 'hybrid' | 'topo' | 'osm'
const BASEMAPS: { key: BasemapKey; label: string; style: string | maplibregl.StyleSpecification }[] = [
  { key: 'dark',      label: 'Dark',                style: STYLE_DARK },
  { key: 'voyager',   label: 'Voyager (streets)',   style: STYLE_VOYAGER },
  { key: 'positron',  label: 'Light',               style: STYLE_POSITRON },
  { key: 'satellite', label: 'Satellite (USGS)',    style: STYLE_SATELLITE },
  { key: 'hybrid',    label: 'Satellite + roads',   style: STYLE_HYBRID },
  { key: 'topo',      label: 'Topographic (USGS)',  style: STYLE_TOPO },
  { key: 'osm',       label: 'OpenStreetMap',       style: STYLE_OSM },
]
function styleFor(key: BasemapKey): string | maplibregl.StyleSpecification {
  return BASEMAPS.find(b => b.key === key)?.style ?? STYLE_DARK
}

// Voltage → color ramp (kV). Discrete step expression so each kV bucket
// matches its legend swatch exactly. Light yellow at the low end → orange in
// the middle → deep purple/magenta at the highest voltages.
const VOLTAGE_COLOR_EXPR: maplibregl.DataDrivenPropertyValueSpecification<string> = [
  'step',
  ['to-number', ['get', 'VOLTAGE'], 0],
  '#fff04a',  // < 69 kV (and unknown / NULL coded as -1 / 0)
  69,  '#ffd000',  // 69 kV
  115, '#ff9800',  // 115 kV
  138, '#ff5722',  // 138 kV
  161, '#ff3d3d',  // 161 kV
  230, '#e91e63',  // 230 kV
  345, '#c026d3',  // 345 kV
  500, '#7b1fa2',  // 500+ kV
] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>

const VOLTAGE_WIDTH_EXPR: maplibregl.DataDrivenPropertyValueSpecification<number> = [
  'interpolate',
  ['linear'],
  ['to-number', ['get', 'VOLTAGE'], 0],
  0,   0.6,
  138, 1.1,
  345, 1.8,
  500, 2.4,
  765, 3.0,
] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>

const VOLTAGE_LEGEND_ITEMS: Array<{ label: string; color: string }> = [
  { label: 'Less than 69 kV', color: '#fff04a' },
  { label: '69 kV',           color: '#ffd000' },
  { label: '115 kV',          color: '#ff9800' },
  { label: '138 kV',          color: '#ff5722' },
  { label: '161 kV',          color: '#ff3d3d' },
  { label: '230 kV',          color: '#e91e63' },
  { label: '345 kV',          color: '#c026d3' },
  { label: '500+ kV',         color: '#7b1fa2' },
]

function colorForScore(score: number, killed: boolean): string {
  if (killed) return '#3a1018'
  // 0..10 → red..amber..green
  const t = Math.max(0, Math.min(1, score / 10))
  if (t < 0.5) {
    const k = t / 0.5
    // red -> amber
    const r = Math.round(255)
    const g = Math.round(26 + (149 - 26) * k)
    const b = Math.round(64 - 64 * k)
    return `rgb(${r},${g},${b})`
  } else {
    const k = (t - 0.5) / 0.5
    // amber -> green
    const r = Math.round(255 - (255 - 57) * k)
    const g = Math.round(149 + (211 - 149) * k)
    const b = Math.round(0 + 83 * k)
    return `rgb(${r},${g},${b})`
  }
}

const ARCHETYPES: Archetype[] = ['training', 'inference', 'mixed']

// Strip per-state suffixes like " (NC)" / " (SC \u2013 York)" / " (KY \u2013 Jefferson)"
// from layer display names \u2014 we now expose multiple states and the active
// state is implicit from the State selector.
function prettyLayerName(l: LiveLayer): string {
  if (l.key.endsWith('_parcels')) return 'Parcel outlines'
  return l.name
}

const TOP_SITE_COUNT = 20
const CANDIDATE_SITE_COUNT = 80
const CONUS_BBOX: [number, number, number, number] = [-125, 24, -66, 49]

const FALLBACK_SAMPLE_SITES: Array<{ site_id: string; lat: number; lon: number; state: string }> = [
  { site_id: 'TX-ABL-001', lat: 32.4487, lon: -99.7331, state: 'TX' },
  { site_id: 'VA-LDN-001', lat: 39.0840, lon: -77.6555, state: 'VA' },
  { site_id: 'GA-DGL-001', lat: 33.9526, lon: -84.5499, state: 'GA' },
  { site_id: 'AZ-PHX-001', lat: 33.4484, lon: -112.0740, state: 'AZ' },
  { site_id: 'IA-DSM-001', lat: 41.5868, lon: -93.6250, state: 'IA' },
  { site_id: 'WI-MTP-001', lat: 42.7228, lon: -87.7829, state: 'WI' },
  { site_id: 'WA-QCY-001', lat: 47.2343, lon: -119.8521, state: 'WA' },
  { site_id: 'NE-OMA-001', lat: 41.2565, lon: -95.9345, state: 'NE' },
  { site_id: 'TN-CLA-001', lat: 36.5298, lon: -87.3595, state: 'TN' },
  { site_id: 'TX-TMP-001', lat: 31.0982, lon: -97.3428, state: 'TX' },
]

type SiteInput = { site_id: string; lat: number; lon: number; [k: string]: unknown }

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function mergeCoordsIntoResults(results: SiteResultDTO[], inputs: SiteInput[]): SiteResultDTO[] {
  const byId = new Map(inputs.map((s) => [s.site_id, s]))
  return results
    .map((r) => {
      const src = byId.get(r.site_id)
      if (!src) return r
      return { ...r, lat: src.lat, lon: src.lon, extras: { ...(r.extras ?? {}), ...src } }
    })
    .filter((r) => isFiniteNumber(r.lat) && isFiniteNumber(r.lon))
}

function topRankedResults(results: SiteResultDTO[], inputs: SiteInput[], topCount = TOP_SITE_COUNT): SiteResultDTO[] {
  return mergeCoordsIntoResults(results, inputs)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, topCount)
}

function ringContainsPoint(ring: number[][], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function polygonContainsPoint(rings: number[][][], lon: number, lat: number): boolean {
  if (!rings.length) return false
  if (!ringContainsPoint(rings[0], lon, lat)) return false
  for (let i = 1; i < rings.length; i += 1) {
    if (ringContainsPoint(rings[i], lon, lat)) return false
  }
  return true
}

function boundaryContainsPoint(
  fc: { features?: Array<{ geometry?: { type?: string; coordinates?: any } }> },
  lon: number,
  lat: number,
): boolean {
  for (const feature of fc.features ?? []) {
    const geom = feature.geometry
    if (!geom?.coordinates) continue
    if (geom.type === 'Polygon' && polygonContainsPoint(geom.coordinates as number[][][], lon, lat)) {
      return true
    }
    if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates as number[][][][]) {
        if (polygonContainsPoint(poly, lon, lat)) return true
      }
    }
  }
  return false
}

function boundaryBbox(
  fc: { features?: Array<{ geometry?: { coordinates?: any } }> },
): [number, number, number, number] | null {
  let xmin = Infinity
  let ymin = Infinity
  let xmax = -Infinity
  let ymax = -Infinity
  const walk = (coords: any): void => {
    if (!Array.isArray(coords) || coords.length === 0) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      xmin = Math.min(xmin, coords[0])
      ymin = Math.min(ymin, coords[1])
      xmax = Math.max(xmax, coords[0])
      ymax = Math.max(ymax, coords[1])
      return
    }
    for (const sub of coords) walk(sub)
  }
  for (const feature of fc.features ?? []) walk(feature.geometry?.coordinates)
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin) || !Number.isFinite(xmax) || !Number.isFinite(ymax)) {
    return null
  }
  return [xmin, ymin, xmax, ymax]
}

function generateClientStateCandidates(
  state: string,
  boundaryFc: { features?: Array<{ geometry?: { type?: string; coordinates?: any } }> },
  count: number,
  bbox: [number, number, number, number],
): SiteInput[] {
  const [xmin, ymin, xmax, ymax] = bbox
  const xSpan = xmax - xmin
  const ySpan = ymax - ymin
  if (xSpan <= 0 || ySpan <= 0) return []
  const seed = Array.from(state).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  const offX = ((seed % 997) + 0.5) / 997
  const offY = (((Math.floor(seed / 997) % 991)) + 0.5) / 991
  const target = Math.max(count, 1)
  const attempts = Math.max(target * 30, 600)
  const seenCells = new Set<string>()
  const cols = Math.max(8, Math.floor(Math.sqrt(target) * 2.5))
  const rows = Math.max(8, Math.floor(Math.sqrt(target) * 2.5))
  const out: SiteInput[] = []
  for (let i = 0; i < attempts; i += 1) {
    const fx = (offX + (i + 0.5) * 0.6180339887498949) % 1
    const fy = (offY + (i + 0.5) * 0.7548776662466927) % 1
    const cell = `${Math.floor(fx * cols)}:${Math.floor(fy * rows)}`
    if (seenCells.has(cell)) continue
    const lon = xmin + fx * xSpan
    const lat = ymin + fy * ySpan
    if (!boundaryContainsPoint(boundaryFc, lon, lat)) continue
    seenCells.add(cell)
    const idx = out.length + 1
    out.push({
      site_id: `${state}-CAND-${String(idx).padStart(3, '0')}`,
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      state,
      generated: true,
      source: 'client_state_boundary',
    })
    if (out.length >= target) break
  }
  return out
}

export default function SitingPanel() {
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  // Tracks per-overlay event-listener fns so we can remove them when the
  // overlay is toggled off (otherwise toggling repeatedly leaks N listeners
  // and a single click would fire N popups).
  const overlayHandlersRef = useRef<Map<string, Array<{
    type: 'click' | 'mouseenter' | 'mouseleave' | 'mousemove'
    layerId: string
    fn: (e: any) => void
  }>>>(new Map())
  // Per-overlay fetch-generation counter. Incremented every time a layer is
  // toggled off, removed, or re-fetched so in-flight responses for an older
  // generation are discarded. Without this, a slow upstream can re-add a
  // layer the user already deselected.
  const overlayGenRef = useRef<Map<string, number>>(new Map())
  // Per-overlay enabled state mirror so async fetches can short-circuit
  // even before the next render commits the state change.
  const enabledRef = useRef<Record<string, boolean>>({})
  const [mapReady, setMapReady] = useState(false)
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null)

  const [factorsCatalog, setFactorsCatalog] = useState<SitingFactorsResponse | null>(null)
  const [layers, setLayers] = useState<LiveLayer[]>([])
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState<number>(6)

  const [archetype, setArchetype] = useState<Archetype>('training')
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>({})

  const [sites, setSites] = useState<SiteResultDTO[]>([])
  const [siteInputs, setSiteInputs] = useState<SiteInput[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailSite, setDetailSite] = useState<SiteResultDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [layerStatus, setLayerStatus] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'missing' | 'error'>>({})
  const [error, setError] = useState<string | null>(null)

  // ── new: state selector, satellite toggle, moratoriums, parcel popup ──
  const [stateOptions, setStateOptions] = useState<StateOption[]>([])
  const [activeState, setActiveState] = useState<string>('NC')
  const [basemap, setBasemap] = useState<BasemapKey>('hybrid')
  const [moratoriums, setMoratoriums] = useState<MoratoriumCounty[]>([])
  const moratoriumKeys = useMemo(() => {
    // Build {STATE_NAME|NAME → status} keys for fast lookup in MapLibre filter
    const keys: string[] = []
    for (const c of moratoriums) keys.push(`${c.state}|${c.county}`)
    return keys
  }, [moratoriums])

  const [parcelPopup, setParcelPopup] = useState<{
    lat: number
    lon: number
    props: Record<string, unknown>
    detail?: ParcelDetail
    attrs?: ParcelAttrs
    loading?: boolean
  } | null>(null)

  const [stubCoverage, setStubCoverage] = useState<Record<string, number>>({})

  const [coverage, setCoverage] = useState<CoverageReport | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageErr, setCoverageErr] = useState<string | null>(null)

  const activeParcelLayerKey = useMemo(() => {
    const target = `${activeState.toLowerCase()}_parcels`
    const byKey = layers.find((l) => l.key === target)
    if (byKey) return byKey.key
    const byState = layers.find(
      (l) => l.key.endsWith('_parcels') && (l.state ?? '').toUpperCase() === activeState,
    )
    return byState?.key ?? null
  }, [layers, activeState])

  const refreshCoverage = useCallback(async (state: string) => {
    setCoverageLoading(true)
    setCoverageErr(null)
    const res = await fetchSitingCoverage(state)
    if ('error' in res) {
      setCoverageErr(res.error)
      setCoverage(null)
    } else {
      setCoverage(res)
    }
    setCoverageLoading(false)
  }, [])

  const sanitizeOverrides = useCallback((overrides?: Record<string, number>) => {
    if (!overrides || Object.keys(overrides).length === 0) return undefined
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(overrides)) {
      if ((stubCoverage[k] ?? 0) >= 1) continue
      out[k] = v
    }
    return Object.keys(out).length > 0 ? out : undefined
  }, [stubCoverage])

  const loadStateCandidates = useCallback(async (
    state: string,
    kind: Archetype,
    overrides?: Record<string, number>,
  ) => {
    setScoring(true)
    setError(null)
    try {
      const r = await fetchSitingSample(state, CANDIDATE_SITE_COUNT)
      const fallback = FALLBACK_SAMPLE_SITES.filter((s) => s.state === state)
      const requestedState = state.toUpperCase()
      const serverSites = Array.isArray(r.sites)
        ? (r.sites as SiteInput[])
        : []
      const serverLooksValid = serverSites.length >= TOP_SITE_COUNT
        && serverSites.every((s) => ((s.state as string | undefined) ?? requestedState).toUpperCase() === requestedState)

      let candidates: SiteInput[] = serverLooksValid ? serverSites : []
      if (!serverLooksValid) {
        const boundary = await fetchSitingProxyGeoJSON('state_boundary', CONUS_BBOX, 1, requestedState)
        if (!('error' in boundary)) {
          const boundaryBox = boundaryBbox(
            boundary as { features?: Array<{ geometry?: { coordinates?: any } }> },
          )
          candidates = generateClientStateCandidates(
            requestedState,
            boundary as { features?: Array<{ geometry?: { type?: string; coordinates?: any } }> },
            CANDIDATE_SITE_COUNT,
            boundaryBox ?? CONUS_BBOX,
          )
        }
      }
      if (candidates.length === 0) {
        candidates = fallback.length > 0 ? fallback : FALLBACK_SAMPLE_SITES
      }
      setSiteInputs(candidates)
      const scored = await scoreSites({
        sites: candidates,
        archetype: kind,
        weight_overrides: sanitizeOverrides(overrides),
      })
      if (scored.stub_coverage) setStubCoverage(scored.stub_coverage)
      const top = topRankedResults(scored.results, candidates)
      setSites(top)
      setSelectedId(prev => (prev && top.some((s) => s.site_id === prev)) ? prev : (top[0]?.site_id ?? null))
    } catch (e) {
      setError(String(e))
    } finally {
      setScoring(false)
    }
  }, [sanitizeOverrides])

  useEffect(() => {
    if (!mapReady) return
    refreshCoverage(activeState)
  }, [activeState, mapReady, refreshCoverage])

  // ── init: catalog + layer list + sample sites ─────────────────────────
  const loadCatalog = useCallback(() => {
    setError(null)
    fetchSitingFactors().then(setFactorsCatalog).catch(e => setError(String(e)))
    fetchSitingLiveLayers().then(r => {
      setLayers(r.layers)
      setEnabledLayers(prev => {
        const next: Record<string, boolean> = {}
        const defaultsOn = new Set(['state_boundary', 'transmission', 'natgas_pipelines'])
        for (const l of r.layers) {
          if (l.key === 'transmission_duke') {
            // merged into transmission for a single combined toggle
            next[l.key] = false
          } else {
            next[l.key] = prev[l.key] ?? defaultsOn.has(l.key)
          }
        }
        enabledRef.current = next
        return next
      })
    }).catch(e => setError(String(e)))
    fetchSitingStates().then(r => setStateOptions(r.states)).catch(() => { /* non-fatal */ })
    fetchSitingMoratoriums().then(r => setMoratoriums(r.counties)).catch(() => { /* non-fatal */ })
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    loadStateCandidates(activeState, archetype, weightOverrides)
  }, [activeState, loadStateCandidates])

  // ── init MapLibre ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: styleFor(basemap) as any,
      // Center on North Carolina (initial scope per user)
      center: [-79.2, 35.5],
      zoom: 6.2,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    const updateBbox = () => {
      const b = map.getBounds()
      setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      setZoom(map.getZoom())
    }
    map.on('load', () => {
      mapRef.current = map
      setMapReady(true)
      updateBbox()
    })
    map.on('moveend', updateBbox)
    map.on('zoomend', updateBbox)
    return () => { map.remove(); mapRef.current = null }
  }, [basemap])

  // ── candidate site source/layer (re-render when sites change) ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: sites.map(s => ({
        type: 'Feature',
        id: s.site_id,
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          site_id: s.site_id,
          composite: s.composite,
          killed: Object.values(s.kill_flags).some(Boolean),
          color: colorForScore(s.composite, Object.values(s.kill_flags).some(Boolean)),
        },
      })),
    }
    const SRC = 'sites-src'
    const LYR = 'sites-lyr'
    const LBL = 'sites-lbl'
    const HALO = 'sites-halo'

    if (map.getSource(SRC)) {
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData(fc)
    } else {
      map.addSource(SRC, { type: 'geojson', data: fc })
      map.addLayer({
        id: HALO, type: 'circle', source: SRC,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 8, 22],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.18,
          'circle-blur': 0.6,
        },
      })
      map.addLayer({
        id: LYR, type: 'circle', source: SRC,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 12],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1.2,
        },
      })
      map.addLayer({
        id: LBL, type: 'symbol', source: SRC,
        layout: {
          'text-field': [
            'concat',
            ['to-string', ['round', ['*', ['get', 'composite'], 10]]],
            '',
          ],
          'text-size': 11,
          'text-offset': [0, -1.4],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#000',
          'text-halo-width': 1.4,
        },
      })
      map.on('click', LYR, (e) => {
        const f = e.features?.[0]
        if (f) setSelectedId(String(f.properties?.site_id))
      })
      map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = '' })
    }
  }, [sites, mapReady])

  // ── overlay layers: live ArcGIS proxy, bbox-clipped ───────────────────
  const layersByKey = useMemo(() => {
    const m = new Map<string, LiveLayer>()
    for (const l of layers) m.set(l.key, l)
    return m
  }, [layers])

  const removeOverlay = useCallback((key: string) => {
    const map = mapRef.current
    // Bump generation so any in-flight reload for this key is dropped
    // when it lands. Survives a missing map (e.g. style swap mid-flight).
    overlayGenRef.current.set(key, (overlayGenRef.current.get(key) ?? 0) + 1)
    enabledRef.current[key] = false
    if (!map) return
    const SRC = `ovl-${key}-src`
    const LYR = `ovl-${key}-lyr`
    const LYR_FILL = `ovl-${key}-fill`
    const LYR_HOVER = `ovl-${key}-hover`
    const LYR_MORATORIUM = `ovl-${key}-moratorium`
    // Remove tracked event listeners first (must come before removeLayer)
    const handlers = overlayHandlersRef.current.get(key)
    if (handlers) {
      for (const h of handlers) {
        try { map.off(h.type, h.layerId, h.fn) } catch { /* ignore */ }
      }
      overlayHandlersRef.current.delete(key)
    }
    if (map.getLayer(LYR_MORATORIUM)) map.removeLayer(LYR_MORATORIUM)
    if (map.getLayer(LYR_HOVER)) map.removeLayer(LYR_HOVER)
    if (map.getLayer(LYR)) map.removeLayer(LYR)
    if (map.getLayer(LYR_FILL)) map.removeLayer(LYR_FILL)
    if (map.getSource(SRC)) map.removeSource(SRC)
    setLayerStatus(s => ({ ...s, [key]: 'idle' }))
  }, [])

  const reloadOverlay = useCallback(async (key: string) => {
    const map = mapRef.current
    if (!map) return
    const lyr = layersByKey.get(key)
    if (!lyr) return
    if (!bbox) return
    if (zoom < lyr.min_zoom) {
      setLayerStatus(s => ({ ...s, [key]: 'idle' }))
      // remove any stale layer if we zoomed out below threshold
      removeOverlay(key)
      return
    }
    setLayerStatus(s => ({ ...s, [key]: 'loading' }))
    // Always send the active state — the backend clips every layer to the
    // selected state's bbox so heavy overlays load quickly even at zoom-out.
    const stateFilter: string | null = activeState || null
    // Bump generation; if it changes before we land, discard the response.
    const myGen = (overlayGenRef.current.get(key) ?? 0) + 1
    overlayGenRef.current.set(key, myGen)
    // Keep parcel payloads small at lower zooms; ramp detail as user zooms in.
    // Limits roughly doubled now that the backend pages parcel feeds in
    // parallel + serves them gzipped — at z12 we can afford ~800 parcels
    // for a "regional density" read, then ~2000 once the user zooms in.
    const parcelLimit =
      zoom < 12.5 ? 800 :
      zoom < 13.5 ? 1500 :
      zoom < 14.5 ? 2500 :
      4000
    // For fiber: INVERSE of parcels. Higher zoom = smaller bbox = need FEWER features.
    // This keeps response times fast even at high zoom levels.
    const fiberLimit =
      zoom < 6 ? 1400 :
      zoom < 8 ? 900 :
      500
    const limit =
      lyr.key.endsWith('_parcels') ? parcelLimit :
      lyr.key === 'fiber_lines' ? fiberLimit :
      lyr.key === 'county_subdivisions' ? 2500 :
      50000
    let data: any
    if (key === 'transmission') {
      // Merge Duke-owned lines into the base transmission overlay so the UI has
      // one toggle and one unified voltage legend.
      const [baseData, dukeData] = await Promise.all([
        fetchSitingProxyGeoJSON('transmission', bbox, limit, stateFilter, zoom),
        fetchSitingProxyGeoJSON('transmission_duke', bbox, limit, stateFilter, zoom),
      ])
      const baseOk = !('error' in baseData)
      const dukeOk = !('error' in dukeData)
      if (!baseOk && !dukeOk) {
        setLayerStatus(s => ({ ...s, [key]: 'error' }))
        return
      }
      const mergedFeatures: any[] = []
      if (baseOk && Array.isArray((baseData as any).features)) mergedFeatures.push(...(baseData as any).features)
      if (dukeOk && Array.isArray((dukeData as any).features)) mergedFeatures.push(...(dukeData as any).features)
      data = { type: 'FeatureCollection', features: mergedFeatures }
    } else {
      data = await fetchSitingProxyGeoJSON(key, bbox, limit, stateFilter, zoom)
      if ('error' in data) {
        setLayerStatus(s => ({ ...s, [key]: 'error' }))
        return
      }
    }
    const SRC = `ovl-${key}-src`
    const LYR = `ovl-${key}-lyr`
    const LYR_FILL = `ovl-${key}-fill`
    // Drop stale responses: if generation moved on (e.g. user toggled the
    // layer off, or switched state mid-fetch) abandon this payload so we
    // don't paint a layer the user has already deselected.
    if (overlayGenRef.current.get(key) !== myGen) return
    if (enabledRef.current[key] === false) return
    if (map.getSource(SRC)) {
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData(data as any)
    } else {
      map.addSource(SRC, { type: 'geojson', data: data as any, generateId: true })
      // Only insert below the sites halo if it already exists \u2014 overlays may
      // load before the sites layer if scoring data is still in flight, and
      // an unknown beforeId throws "Cannot add layer X before non-existing layer Y".
      const beforeId = map.getLayer('sites-halo') ? 'sites-halo' : undefined
      if (lyr.geom === 'line') {
        const isVoltage = lyr.style === 'voltage' || key === 'transmission'
        const isFiber = key === 'fiber_lines'
        map.addLayer({
          id: LYR, type: 'line', source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': isVoltage ? VOLTAGE_COLOR_EXPR : lyr.color,
            'line-width': isVoltage
              ? VOLTAGE_WIDTH_EXPR
              : isFiber
                ? ['interpolate', ['linear'], ['zoom'], 4, 1.4, 7, 2.2, 10, 3.0]
                : 1.2,
            'line-opacity': 0.92,
          },
        }, beforeId)
      } else if (lyr.geom === 'point') {
        map.addLayer({
          id: LYR, type: 'circle', source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 10, 5],
            'circle-color': lyr.color,
            'circle-stroke-color': '#000',
            'circle-stroke-width': 0.6,
            'circle-opacity': 0.95,
          },
        }, beforeId)
      } else {
        // polygon
        const isOutline = lyr.style === 'outline'
        if (!isOutline) {
          map.addLayer({
            id: LYR_FILL, type: 'fill', source: SRC,
            paint: { 'fill-color': lyr.color, 'fill-opacity': 0.10 },
          }, beforeId)
        }
        // Note: previously we drew a red moratorium fill on top of
        // county_subdivisions, but that filter joined county-level rows
        // against minor-civil-division features and never matched. Opposition
        // counties are now drawn by the dedicated `county_opposition` layer.
        map.addLayer({
          id: LYR, type: 'line', source: SRC,
          paint: {
            'line-color': lyr.color,
            'line-width': isOutline ? 2.6 : 0.9,
            'line-opacity': isOutline ? 0.95 : 0.85,
          },
        }, beforeId)
        // Parcel layers: hover-highlight + click → popup (Paces-style).
        // Pattern matches the per-state parcel keys (nc_parcels, sc_parcels, …).
        if (key.endsWith('_parcels')) {
          // Add a transparent hit/highlight fill so hover lights up the
          // hovered polygon while the outline stays for non-hovered ones.
          const LYR_HOVER = `ovl-${key}-hover`
          map.addLayer({
            id: LYR_HOVER, type: 'fill', source: SRC,
            paint: {
              'fill-color': '#ffffff',
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false], 0.18,
                0,
              ],
            },
          }, beforeId)
          // Thicken the outline of the hovered polygon for a clear edge.
          map.setPaintProperty(LYR, 'line-width', [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 2.4,
            0.9,
          ])
          map.setPaintProperty(LYR, 'line-color', [
            'case',
            ['boolean', ['feature-state', 'hover'], false], '#ffffff',
            lyr.color,
          ])

          let hoverId: string | number | undefined
          const clearHover = () => {
            if (hoverId !== undefined) {
              try { map.setFeatureState({ source: SRC, id: hoverId }, { hover: false }) } catch { /* ignore */ }
              hoverId = undefined
            }
          }
          const onMove = (e: any) => {
            const f = e.features?.[0]
            if (!f) return
            const id = f.id ?? (f.properties && (f.properties.OBJECTID ?? f.properties.objectid))
            if (id === undefined || id === hoverId) return
            clearHover()
            hoverId = id as string | number
            try { map.setFeatureState({ source: SRC, id: hoverId }, { hover: true }) } catch { /* ignore */ }
          }
          const onLeave = () => { clearHover(); map.getCanvas().style.cursor = '' }
          const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }

          const onClick = (e: any) => {
            const f = e.features?.[0]
            if (!f) return
            setParcelPopup({
              lat: e.lngLat.lat,
              lon: e.lngLat.lng,
              props: f.properties as Record<string, unknown>,
              loading: true,
            })
            // Kick off proximity + enrichment in parallel.
            fetchParcelDetail(e.lngLat.lat, e.lngLat.lng).then(d => {
              if ('error' in d) return
              setParcelPopup(p => p && { ...p, detail: d })
            })
            fetchParcelAttrs(e.lngLat.lat, e.lngLat.lng, activeState).then(a => {
              if ('error' in a) {
                setParcelPopup(p => p && { ...p, loading: false })
                return
              }
              setParcelPopup(p => p && {
                ...p,
                attrs: a,
                // If ArcGIS returned richer parcel props (outFields=*), prefer them.
                props: a.parcel ? { ...p.props, ...a.parcel } : p.props,
                loading: false,
              })
            })
          }
          // Bind to the hit fill so hover/click work on the parcel interior,
          // not just the 1px outline.
          map.on('mousemove', LYR_HOVER, onMove)
          map.on('mouseenter', LYR_HOVER, onEnter)
          map.on('mouseleave', LYR_HOVER, onLeave)
          map.on('click', LYR_HOVER, onClick)
          overlayHandlersRef.current.set(key, [
            { type: 'mouseenter', layerId: LYR_HOVER, fn: onEnter },
            { type: 'mouseleave', layerId: LYR_HOVER, fn: onLeave },
            { type: 'mousemove',  layerId: LYR_HOVER, fn: onMove  },
            { type: 'click',      layerId: LYR_HOVER, fn: onClick },
          ])
        }
      }
    }
    setLayerStatus(s => ({ ...s, [key]: 'ok' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox, zoom, layersByKey, activeState, moratoriumKeys])

  // ── update removeOverlay to also drop the moratorium layer ────────────

  // toggle handler
  function toggleLayer(key: string) {
    setEnabledLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      enabledRef.current[key] = next[key]
      if (next[key]) reloadOverlay(key)
      else removeOverlay(key)
      return next
    })
  }

  // refetch enabled overlays only when zoom threshold changes OR user pans significantly.
  // This prevents endless requests on every tiny pan/zoom while still covering new features.
  // Use refs to track state without creating dependency array thrashing.
  const prevZoomThresholdRef = useRef<number | null>(null)
  const lastFetchBboxRef = useRef<[number, number, number, number] | null>(null)
  
  useEffect(() => {
    if (!mapReady || !bbox) return
    
    // Determine which zoom threshold we're in (affects request limits for fiber/parcels)
    const fiberThreshold = zoom < 6 ? 0 : zoom < 8 ? 1 : 2
    const parcelThreshold = zoom < 12.5 ? 0 : zoom < 13.5 ? 1 : zoom < 14.5 ? 2 : 3
    const maxThreshold = Math.max(fiberThreshold, parcelThreshold)
    
    const prevThreshold = prevZoomThresholdRef.current
    const lastBbox = lastFetchBboxRef.current
    
    // Check if we've panned enough that the backend cache key would change.
    // The backend snaps bbox to a zoom-band-sized grid (≈0.5° at z4 … 1mdeg
    // at z14+), and the api.ts client cache mirrors that. So a 35% pan still
    // collapses to a cache hit when we're inside the same band — no need to
    // be conservative here. (Old value: 20% → too many wasted refetches.)
    const bboxWidth = bbox[2] - bbox[0]
    const bboxHeight = bbox[3] - bbox[1]
    const panThreshold = Math.max(bboxWidth, bboxHeight) * 0.35
    
    const significantPan = lastBbox && (
      Math.abs(bbox[0] - lastBbox[0]) > panThreshold ||
      Math.abs(bbox[1] - lastBbox[1]) > panThreshold
    )
    
    const shouldReload = prevThreshold === null ||
                        prevThreshold !== maxThreshold ||
                        significantPan
    
    if (!shouldReload) return
    
    prevZoomThresholdRef.current = maxThreshold
    lastFetchBboxRef.current = bbox
    
    // Use the ref to avoid dependency array issues, reload all currently-enabled layers
    for (const [key, on] of Object.entries(enabledRef.current)) {
      if (on) reloadOverlay(key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, bbox?.[0], bbox?.[1], bbox?.[2], bbox?.[3], mapReady])

  // ── fly to selected state ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const s = stateOptions.find(o => o.code === activeState)
    if (!s) return
    map.fitBounds(
      [[s.bbox[0], s.bbox[1]], [s.bbox[2], s.bbox[3]]] as LngLatBoundsLike,
      { padding: 60, duration: 800 },
    )
    // Drop any parcel layer from a different state — only the active state's
    // parcel overlay should be loaded at any given time.
    const activeParcelKey = activeParcelLayerKey ?? `${activeState.toLowerCase()}_parcels`
    setEnabledLayers(prev => {
      const next = { ...prev }
      let changed = false
      for (const k of Object.keys(prev)) {
        if (k.endsWith('_parcels') && k !== activeParcelKey && prev[k]) {
          removeOverlay(k)
          next[k] = false
          changed = true
        }
      }
      enabledRef.current = next
      return changed ? next : prev
    })
    // State changed \u2014 every enabled overlay must re-fetch with the new\n    // state filter. Bump generations on all of them so any in-flight\n    // responses for the old state are dropped, then trigger reload.
    for (const k of Object.keys(enabledRef.current)) {
      overlayGenRef.current.set(k, (overlayGenRef.current.get(k) ?? 0) + 1)
    }
    setTimeout(() => {
      for (const [key, on] of Object.entries(enabledLayers)) {
        if (on && !(key.endsWith('_parcels') && key !== activeParcelKey)) {
          reloadOverlay(key)
        }
      }
    }, 900)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState, stateOptions, mapReady, activeParcelLayerKey])

  // ── switch basemap (dark ↔ satellite) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const target = styleFor(basemap)
    map.setStyle(target as any)
    map.once('styledata', () => {
      // The site source/layers and overlays were dropped with the old style.
      // styledata fires after the new style is fully loaded, so we can re-add
      // overlays directly without a setTimeout race.
      // Drop tracked listener refs — the layers they pointed to no longer exist.
      overlayHandlersRef.current.clear()
      setSites(s => [...s])
      for (const [key, on] of Object.entries(enabledLayers)) {
        if (on) reloadOverlay(key)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap])

  // ── re-score on archetype / weight changes ────────────────────────────
  async function rescoreAll() {
    if (siteInputs.length === 0) {
      await loadStateCandidates(activeState, archetype, weightOverrides)
      return
    }
    setScoring(true)
    setError(null)
    try {
      const r = await scoreSites({
        sites: siteInputs,
        archetype,
        weight_overrides: sanitizeOverrides(weightOverrides),
      })
      const top = topRankedResults(r.results, siteInputs)
      setSites(top)
      setSelectedId(prev => (prev && top.some((s) => s.site_id === prev)) ? prev : (top[0]?.site_id ?? null))
      if (r.stub_coverage) setStubCoverage(r.stub_coverage)
    } catch (e) {
      setError(String(e))
    } finally {
      setScoring(false)
    }
  }

  useEffect(() => { rescoreAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [archetype])

  const selected = useMemo(
    () => sites.find(s => s.site_id === selectedId) ?? null,
    [selectedId, sites],
  )

  function flyTo(s: SiteResultDTO) {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center: [s.lon, s.lat], zoom: 8.5, speed: 1.4 })
    setSelectedId(s.site_id)
  }

  const ranked = useMemo(
    () => [...sites].sort((a, b) => b.composite - a.composite),
    [sites],
  )

  const displayedRanked = useMemo(
    () => ranked.slice(0, TOP_SITE_COUNT),
    [ranked],
  )

  const factorList = factorsCatalog?.factors ?? []
  const baseWeights = factorsCatalog?.weights[archetype] ?? {}

  const stubbedFactors = useMemo(() => {
    const out = new Set<string>()
    for (const f of factorList) {
      if ((stubCoverage[f] ?? 1) >= 1) out.add(f)
    }
    return out
  }, [factorList, stubCoverage])

  const effectiveWeightPct = useMemo(() => {
    const raw: Record<string, number> = {}
    let total = 0
    for (const f of factorList) {
      const base = weightOverrides[f] ?? baseWeights[f] ?? 0
      const val = stubbedFactors.has(f) ? 0 : base
      raw[f] = val
      total += val
    }
    const out: Record<string, number> = {}
    for (const f of factorList) {
      out[f] = total > 0 ? (raw[f] / total) * 100 : 0
    }
    return out
  }, [factorList, baseWeights, weightOverrides, stubbedFactors])

  const visibleLayers = useMemo(
    () => layers.filter((l) => l.key !== 'transmission_duke'),
    [layers],
  )

  const activeLegendLayers = useMemo(
    () => visibleLayers.filter((l) => {
      if (l.key === 'transmission') return !!enabledLayers.transmission || !!enabledLayers.transmission_duke
      return !!enabledLayers[l.key]
    }),
    [visibleLayers, enabledLayers],
  )

  function setWeight(factor: string, val: number) {
    setWeightOverrides(w => ({ ...w, [factor]: val }))
  }

  function resetWeights() {
    setWeightOverrides({})
  }

  return (
    <div className="siting-root">
      {/* ── Sidebar ── */}
      <aside className="siting-side">
        <div className="siting-side-head">
          <span className="siting-title">SITING.MAP</span>
        </div>

        <section className="siting-block">
          <div className="siting-block-head">ARCHETYPE</div>
          <ToggleButtonGroup
            value={archetype}
            exclusive
            size="small"
            onChange={(_, v) => v && setArchetype(v as Archetype)}
            sx={{ width: '100%', '& .MuiToggleButton-root': { flex: 1 } }}
          >
            {ARCHETYPES.map(a => (
              <ToggleButton key={a} value={a}>{a.toUpperCase()}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </section>

        <section className="siting-block">
          <div className="siting-block-head">STATE</div>
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            <Select
              value={activeState}
              onChange={(e) => setActiveState(e.target.value as string)}
              size="small"
              sx={{ minWidth: 90 }}
            >
              {stateOptions.length === 0 && (
                <MenuItem value="NC">NC</MenuItem>
              )}
              {stateOptions.length > 0 && [
                <ListSubheader key="duke-hdr" sx={{ background: 'transparent', color: avalonPalette.amber, lineHeight: '24px', fontFamily: '"VT323", monospace', letterSpacing: '0.18em' }}>Duke territory</ListSubheader>,
                ...stateOptions.filter(s => s.duke).map(s => (
                  <MenuItem key={s.code} value={s.code}>{s.code}</MenuItem>
                )),
                <ListSubheader key="other-hdr" sx={{ background: 'transparent', color: avalonPalette.amber, lineHeight: '24px', fontFamily: '"VT323", monospace', letterSpacing: '0.18em' }}>Other</ListSubheader>,
                ...stateOptions.filter(s => !s.duke).map(s => (
                  <MenuItem key={s.code} value={s.code}>{s.code}</MenuItem>
                )),
              ]}
            </Select>
            <Box sx={{ fontSize: 10, color: avalonPalette.whiteDim, letterSpacing: '0.05em' }}>
              filters power layers + flies map
            </Box>
          </Box>
        </section>

        <section className="siting-block">
          <div className="siting-block-head">
            <span>OVERLAYS · LIVE</span>
            <span className="siting-block-meta">z{zoom.toFixed(1)} · bbox</span>
          </div>
          {Object.entries(
            layers
              .filter(l => l.key !== 'transmission_duke')
              // Only show a single parcel toggle for the active state.
              // Fallback to key-prefix matching so this still works even if
              // backend metadata is stale/missing `state`.
              .filter(l => !l.key.endsWith('_parcels') || l.key === activeParcelLayerKey)
              .reduce<Record<string, LiveLayer[]>>((acc, l) => {
                (acc[l.group] ||= []).push(l)
                return acc
              }, {}),
          ).map(([group, items]) => (
            <div key={group} className="layer-group">
              <div className="layer-group-head">{group}</div>
              <ul className="layer-list">
                {items.map(l => {
                  const st = layerStatus[l.key] ?? 'idle'
                  const tooFar = zoom < l.min_zoom
                  const note =
                    tooFar           ? `zoom ≥ ${l.min_zoom}` :
                    st === 'loading' ? '…' :
                    st === 'error'   ? 'err' :
                    st === 'ok'      ? '●' : ''
                  return (
                    <li key={l.key} className={`layer-row ${enabledLayers[l.key] ? 'on' : ''} ${layerStatus[l.key] === 'loading' ? 'is-loading' : ''}`}>
                      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
                        <Switch
                          size="small"
                          checked={!!enabledLayers[l.key]}
                          onChange={() => toggleLayer(l.key)}
                          sx={{ p: 0.5 }}
                        />
                        <span className="layer-dot" style={{ background: l.color }} />
                        <Tooltip title={`${l.source} · z≥${l.min_zoom}`} placement="right" arrow>
                          <span className="layer-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prettyLayerName(l)}</span>
                        </Tooltip>
                      </Box>
                      <span className="layer-note">{note}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div className="ingest-hint">
            Live ArcGIS proxy · HIFLD + NC OneMap · pan/zoom to load tiles.
          </div>
        </section>

        <section className="siting-block dq-block">
          <div className="siting-block-head">
            <span>DATA QUALITY · {activeState}</span>
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              onClick={() => refreshCoverage(activeState)}
              disabled={coverageLoading}
              sx={{ minWidth: 0, px: 0.5, color: avalonPalette.cyan, fontSize: 10 }}
            >{coverageLoading ? '…' : 'refresh'}</Button>
          </div>
          {coverageErr && <div className="dq-err">{coverageErr}</div>}
          {!coverage && !coverageErr && !coverageLoading && (
            <div className="ingest-hint">
              Click <em>refresh</em> to probe live source coverage for the selected state region.
            </div>
          )}
          {coverage && (
            <>
              <div className="dq-summary">
                <span><b>{coverage.layers_with_data}</b>/{coverage.layers_total}</span>
                <span>layers live · {coverage.generated_ms_total} ms total</span>
              </div>
              {coverage.queue && (
                <div className="dq-queue">
                  <div className="dq-row-head">
                    <span className="dq-name">Queue ingest</span>
                    <span className={`dq-conf ${coverage.queue.ok && coverage.queue.cache?.cached ? 'ok' : ''}`}>
                      {coverage.queue.ok && coverage.queue.cache?.cached ? 'live cache' : 'fallback'}
                    </span>
                  </div>
                  <div className="dq-row-meta">
                    <span>projects {coverage.queue.projects ?? 0}</span>
                    <span>geocoded {coverage.queue.geocoded_projects ?? 0}</span>
                    <span>as_of {coverage.queue.provenance?.as_of ?? 'embedded'}</span>
                    {coverage.queue.state_metrics && (
                      <span>
                        state active MW {Number((coverage.queue.state_metrics['active_mw_100mi'] as number | undefined) ?? 0).toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <ul className="dq-list">
                {coverage.layers.map((row) => {
                  const conf = row.confidence ?? (row.ok ? 'ok' : 'gap')
                  return (
                    <li key={row.key} className={`dq-row dq-${conf}`}>
                      <div className="dq-row-head">
                        <span className="dq-name">{row.name}</span>
                        <span className="dq-conf">{conf}</span>
                      </div>
                      <div className="dq-row-meta">
                        <span>{row.source}</span>
                        <span>{row.ok ? `${row.returned ?? 0} feats` : (row.error ?? 'error')}</span>
                        <span>{row.elapsed_ms ?? 0}ms</span>
                        {row.source_count && row.source_count > 1 && (
                          <span title="Multi-source merge">×{row.source_count}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section className="siting-block weights-block">
          <div className="siting-block-head">
            <span>WEIGHTS · {archetype}</span>
            <Button size="small" variant="text" onClick={resetWeights} sx={{ minWidth: 0, px: 0.5, color: avalonPalette.cyan, fontSize: 10 }}>reset</Button>
          </div>
          {factorList.length > 0 && Object.keys(stubCoverage).length > 0 && (() => {
            const real = factorList.filter(f => (stubCoverage[f] ?? 1) < 1).length
            const pct = Math.round((real / factorList.length) * 100)
            return (
              <div className="coverage-badge" title="Fraction of factors producing real (non-imputed) sub-scores for at least one site.">
                data coverage · <span style={{ color: pct >= 50 ? 'var(--green)' : 'var(--amber)' }}>{real}/{factorList.length}</span> factors live ({pct}%)
              </div>
            )
          })()}
          <div className="weight-list">
            {factorList.map(f => {
              const base = baseWeights[f] ?? 0
              const cur = weightOverrides[f] ?? base
              const cov = stubCoverage[f]
              const stubbed = cov != null && cov >= 1
              const eff = effectiveWeightPct[f] ?? 0
              return (
                <div key={f} className="weight-row">
                  <div className="weight-row-head">
                    <span className="factor-name">
                      {f}
                      {stubbed && <Chip size="small" label="STUB" sx={{ ml: 0.5, height: 14, fontSize: 9, color: avalonPalette.whiteDim, borderColor: avalonPalette.border }} title="imputed from cohort median (no real data yet)" />}
                    </span>
                    <span className="factor-val" title="effective normalized weight across live factors">
                      {(cur * 100).toFixed(0)} · eff {eff.toFixed(0)}
                    </span>
                  </div>
                  <Slider
                    value={cur}
                    min={0}
                    max={0.30}
                    step={0.01}
                    disabled={stubbed}
                    onChange={(_, v) => setWeight(f, Array.isArray(v) ? v[0] : v)}
                    sx={{ mt: 0.25 }}
                  />
                </div>
              )
            })}
          </div>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={rescoreAll}
            disabled={scoring}
            sx={{ mt: 1 }}
          >
            {scoring ? 'SCORING…' : 'RESCORE'}
          </Button>
          {scoring && <LinearProgress sx={{ mt: 0.5 }} />}
        </section>

        {error && (
          <div className="siting-err">
            <span>{error}</span>
            <Button size="small" variant="text" onClick={loadCatalog} sx={{ color: avalonPalette.cyan, fontSize: 10 }}>retry</Button>
          </div>
        )}
      </aside>

      {/* ── Map ── */}
      <div className="siting-mapwrap">
        <div ref={mapDivRef} className="siting-map" />
        <div className="map-toolbar">
          <select
            className="basemap-select"
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as BasemapKey)}
            title="Basemap"
          >
            {BASEMAPS.map(b => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <span className="bbox-readout">
            {bbox && `${bbox[1].toFixed(2)}°N ${bbox[0].toFixed(2)}°E → ${bbox[3].toFixed(2)}°N ${bbox[2].toFixed(2)}°E`}
          </span>
        </div>
        {/* In-flight overlay-fetch indicator. Pulses while any layer is
            loading so the user sees the system is working — important now
            that pans collapse to the cache and "instant" can otherwise look
            like "did anything happen?". */}
        {(() => {
          const inflight = Object.values(layerStatus).filter(s => s === 'loading').length
          if (inflight === 0) return null
          return (
            <div className="net-indicator" title={`${inflight} layer${inflight === 1 ? '' : 's'} loading`}>
              <span className="net-dot" />
              <span className="net-label">LOADING · {inflight}</span>
            </div>
          )
        })()}
        {activeLegendLayers.length > 0 && (
          <div className="map-legend">
            <div className="map-legend-head">ACTIVE LAYERS</div>
            {activeLegendLayers.map((l) => {
              const voltageStyle = l.key === 'transmission'
              return (
                  voltageStyle ? (
                    <div className="map-legend-voltage" key={l.key}>
                      <div className="map-legend-row">
                        <span
                          className="map-legend-swatch"
                          style={{
                            background:
                              'linear-gradient(90deg, #fff04a, #ff9800, #e91e63, #7b1fa2)',
                          }}
                        />
                        <span className="map-legend-name">Transmission grid lines</span>
                      </div>
                      <div className="map-legend-voltage-head">VOLTAGE</div>
                      {VOLTAGE_LEGEND_ITEMS.map((item) => (
                        <div className="map-legend-voltage-row" key={item.label}>
                          <span className="map-legend-voltage-swatch" style={{ background: item.color }} />
                          <span className="map-legend-name">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <div className="map-legend-row" key={l.key}>
                    <span className="map-legend-swatch" style={{ background: l.color }} />
                    <span className="map-legend-name">{prettyLayerName(l)}</span>
                  </div>
                )
              )
            })}
          </div>
        )}
        {parcelPopup && (
          <div className="parcel-popup">
            <div className="parcel-popup-head">
              <span>PARCEL</span>
              <button className="link-btn" onClick={() => setParcelPopup(null)}>×</button>
            </div>
            <div className="parcel-popup-body">
              {(() => {
                const p = parcelPopup.props as Record<string, unknown>
                const pick = (...keys: string[]) => {
                  for (const k of keys) {
                    const v = p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()]
                    if (v != null && v !== '') return v
                  }
                  return null
                }
                const owner = pick('ownname', 'owner', 'ownname1', 'deedowner')
                const parno = pick('parno', 'pin', 'parcelid', 'parcel_id')
                const acres = pick('deedacres', 'calc_acres', 'calcacres', 'acres', 'gisacres')
                const landVal = pick('landval', 'landvalue')
                const improvVal = pick('improvval', 'improvvalue', 'bldgval')
                const totalVal = pick('totalval', 'totval', 'parvaltot')
                const address = pick('siteaddress', 'situs_addr', 'addr', 'propaddr')
                const city = pick('sitecity', 'city', 'situs_city')
                const zoning = pick('zoning', 'zonecode', 'landuse', 'luc')
                const yearBuilt = pick('yearbuilt', 'yrblt')
                const rows: Array<[string, string]> = []
                if (owner) rows.push(['owner', String(owner)])
                if (parno) rows.push(['parcel #', String(parno)])
                if (address) rows.push(['address', [address, city].filter(Boolean).join(', ')])
                if (acres != null) rows.push(['acreage', Number(acres).toFixed(2)])
                if (zoning) rows.push(['zoning / land use', String(zoning)])
                if (yearBuilt) rows.push(['year built', String(yearBuilt)])
                if (landVal != null) rows.push(['land $', `$${Number(landVal).toLocaleString()}`])
                if (improvVal != null) rows.push(['improvement $', `$${Number(improvVal).toLocaleString()}`])
                if (totalVal != null) rows.push(['total assessed $', `$${Number(totalVal).toLocaleString()}`])
                rows.push(['location', `${parcelPopup.lat.toFixed(4)}°, ${parcelPopup.lon.toFixed(4)}°`])
                return rows.map(([k, v]) => (
                  <div className="parcel-row" key={k}>
                    <span>{k}</span><span>{v || '—'}</span>
                  </div>
                ))
              })()}

              {parcelPopup.attrs?.census && (
                <>
                  <div className="parcel-section">JURISDICTION</div>
                  <div className="parcel-row">
                    <span>county</span>
                    <span>{parcelPopup.attrs.census.county ?? '—'}{parcelPopup.attrs.census.county_fips ? ` (${parcelPopup.attrs.census.county_fips})` : ''}</span>
                  </div>
                  <div className="parcel-row">
                    <span>census tract</span>
                    <span>{parcelPopup.attrs.census.tract_fips ?? '—'}</span>
                  </div>
                </>
              )}

              {parcelPopup.attrs?.flood && (
                <>
                  <div className="parcel-section">FLOOD (FEMA NFHL)</div>
                  <div className="parcel-row">
                    <span>zone</span>
                    <span>{parcelPopup.attrs.flood.zone ?? '—'}</span>
                  </div>
                  <div className="parcel-row">
                    <span>SFHA</span>
                    <span>{parcelPopup.attrs.flood.in_special_flood_hazard_area ? 'YES (risk)' : 'no'}</span>
                  </div>
                </>
              )}

              {parcelPopup.attrs?.substation && (
                <>
                  <div className="parcel-section">SUBSTATION ON PARCEL</div>
                  {[
                    ['name',           parcelPopup.attrs.substation.name],
                    ['owner',          parcelPopup.attrs.substation.owner],
                    ['operator',       parcelPopup.attrs.substation.operator],
                    ['type',           parcelPopup.attrs.substation.type],
                    ['status',         parcelPopup.attrs.substation.status],
                    ['max voltage kV', parcelPopup.attrs.substation.max_voltage_kv],
                    ['min voltage kV', parcelPopup.attrs.substation.min_voltage_kv],
                    ['lines in',       parcelPopup.attrs.substation.lines_in],
                    ['county',         parcelPopup.attrs.substation.county],
                    ['state',          parcelPopup.attrs.substation.state],
                    ['source',         parcelPopup.attrs.substation.source],
                    ['source date',    parcelPopup.attrs.substation.source_date],
                  ]
                    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'NOT AVAILABLE')
                    .map(([label, v]) => (
                      <div className="parcel-row" key={String(label)}>
                        <span>{label}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                </>
              )}

              <div className="parcel-section">PROXIMITY</div>
              {parcelPopup.loading && <div className="parcel-row"><span>computing…</span></div>}
              {parcelPopup.detail?.results.map(r => (
                <div className="parcel-row" key={r.layer}>
                  <span>{r.label}</span>
                  <span>{r.distance_mi == null ? '— (none in 5 mi)' : `${r.distance_mi} mi`}</span>
                </div>
              ))}

              {parcelPopup.attrs?.sources && parcelPopup.attrs.sources.length > 0 && (
                <div className="parcel-row" style={{ marginTop: 8, fontSize: 9, color: '#6a7484' }}>
                  <span>sources</span>
                  <span>{parcelPopup.attrs.sources.join(' · ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {selected && (
          <div className="site-detail">
            <div className="detail-head">
              <span className="detail-id">{selected.site_id}</span>
              <span
                className="detail-score"
                style={{ color: colorForScore(selected.composite, Object.values(selected.kill_flags).some(Boolean)) }}
              >{selected.composite.toFixed(2)}</span>
              <button className="link-btn" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <div className="detail-meta">
              {selected.lat.toFixed(4)}°, {selected.lon.toFixed(4)}°
              {Object.entries(selected.kill_flags).filter(([, v]) => v).map(([k]) => (
                <span key={k} className="kill-tag">KILL: {k}</span>
              ))}
            </div>
            <table className="detail-tbl">
              <thead><tr><th>factor</th><th>raw</th><th>norm</th><th>w</th><th>·w</th></tr></thead>
              <tbody>
                {Object.entries(selected.factors)
                  .sort((a, b) => b[1].weighted - a[1].weighted)
                  .map(([k, f]) => (
                    <tr key={k} className={f.killed ? 'killed' : ''}>
                      <td>{k}</td>
                      <td>{f.raw_value == null ? '—' : Number(f.raw_value).toFixed(2)}</td>
                      <td>{(f.normalized * 100).toFixed(0)}</td>
                      <td>{(f.weight * 100).toFixed(0)}</td>
                      <td>{(f.weighted * 100).toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {selected.imputed.length > 0 && (
              <div className="imputed-note">imputed (cohort median): {selected.imputed.join(', ')}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Right rail: ranked list ── */}
      <aside className="siting-rank">
        <div className="siting-side-head">
          <span className="siting-title">TOP {displayedRanked.length} · {activeState}</span>
          <span className="siting-sub">{archetype}</span>
          <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
            <Tooltip title="Export as GeoJSON">
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const fc = {
                    type: 'FeatureCollection' as const,
                    features: displayedRanked.map(s => ({
                      type: 'Feature' as const,
                      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
                      properties: {
                        site_id: s.site_id,
                        composite: s.composite,
                        ...Object.fromEntries(
                          Object.entries(s.factors).map(([k, f]) => [
                            `factor_${k}`,
                            { normalized: f.normalized, weighted: f.weighted, stub: f.stub },
                          ])
                        ),
                        kill_flags: s.kill_flags,
                      },
                    })),
                  }
                  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `avalon-sites-${activeState}-${new Date().toISOString().slice(0, 10)}.geojson`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                sx={{
                  fontFamily: '"VT323", monospace',
                  fontSize: 10,
                  color: avalonPalette.cyan,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  p: 0.5,
                  '&:hover': { color: avalonPalette.cyanDim },
                }}
              >
                GeoJSON
              </Button>
            </Tooltip>
            <Tooltip title="Export as CSV">
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const headers = ['site_id', 'latitude', 'longitude', 'composite', 'killed', ...Object.keys(displayedRanked[0]?.factors || {})]
                  const rows = displayedRanked.map(s => [
                    s.site_id,
                    s.lat,
                    s.lon,
                    s.composite,
                    Object.values(s.kill_flags).some(Boolean) ? 'YES' : 'NO',
                    ...Object.entries(s.factors).map(([, f]) => f.normalized.toFixed(3)),
                  ])
                  const escapeCsvField = (v: any) => {
                    const str = String(v)
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                      return `"${str.replace(/"/g, '""')}"`
                    }
                    return str
                  }
                  const csv = [headers.map(escapeCsvField).join(','), ...rows.map(r => r.map(escapeCsvField).join(','))].join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `avalon-sites-${activeState}-${new Date().toISOString().slice(0, 10)}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                sx={{
                  fontFamily: '"VT323", monospace',
                  fontSize: 10,
                  color: avalonPalette.amber,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  p: 0.5,
                  '&:hover': { color: avalonPalette.amberDim },
                }}
              >
                CSV
              </Button>
            </Tooltip>
          </Box>
        </div>
        <ol className="rank-list">
          {displayedRanked.map((s, i) => {
            const killed = Object.values(s.kill_flags).some(Boolean)
            return (
              <li
                key={s.site_id}
                className={`rank-row ${selectedId === s.site_id ? 'sel' : ''} ${killed ? 'killed' : ''}`}
                onClick={() => {
                  flyTo(s)
                  setDetailSite(s)
                  setDetailOpen(true)
                }}
              >
                <span className="rank-idx">{i + 1}</span>
                <span className="rank-id">{s.site_id}</span>
                <span
                  className="rank-score"
                  style={{ color: colorForScore(s.composite, killed) }}
                >{s.composite.toFixed(2)}</span>
              </li>
            )
          })}
        </ol>
      </aside>

      <SiteDetailsModal site={detailSite} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  )
}
