import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import maplibregl, { Map as MLMap } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  fetchSitingFactors,
  fetchSitingSample,
  fetchSitingLiveLayers,
  fetchSitingProxyGeoJSON,
  fetchSitingStates,
  fetchSitingMoratoriums,
  fetchParcelDetail,
  scoreSites,
  type Archetype,
  type LiveLayer,
  type SiteResultDTO,
  type SitingFactorsResponse,
  type StateOption,
  type MoratoriumCounty,
  type ParcelDetail,
} from '../api'
import './SitingPanel.css'

// Free MapLibre styles — no API key required
const STYLE_DARK =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// ESRI World Imagery raster tiles — used for the satellite toggle
const STYLE_SATELLITE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN',
    },
    'esri-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'esri-imagery' },
    { id: 'labels', type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.8 } },
  ],
}

// Voltage → color ramp (kV). Used as a data-driven MapLibre expression for
// the transmission lines layers.
const VOLTAGE_COLOR_EXPR: maplibregl.DataDrivenPropertyValueSpecification<string> = [
  'interpolate',
  ['linear'],
  ['to-number', ['get', 'VOLTAGE'], 0],
  -10, '#5a6470',     // unknown / NULL coded as -1
  0,   '#5a6470',
  69,  '#ffeb3b',     // distribution
  115, '#ffc107',
  138, '#ff9800',
  230, '#ff5722',
  345, '#e91e63',
  500, '#9c27b0',
  765, '#3f51b5',
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

const FALLBACK_BY_ID: Record<string, SiteInput> = Object.fromEntries(
  FALLBACK_SAMPLE_SITES.map((s) => [s.site_id, s]),
)

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function toSiteInputsFromResults(results: SiteResultDTO[]): SiteInput[] {
  const out: SiteInput[] = []
  for (const r of results as Array<SiteResultDTO & { extras?: Record<string, unknown> }>) {
    const lat = isFiniteNumber(r.lat) ? r.lat : FALLBACK_BY_ID[r.site_id]?.lat
    const lon = isFiniteNumber(r.lon) ? r.lon : FALLBACK_BY_ID[r.site_id]?.lon
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) continue
    out.push({ site_id: r.site_id, lat, lon, ...(r.extras ?? {}) })
  }
  return out
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

export default function SitingPanel() {
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  // Tracks per-overlay event-listener fns so we can remove them when the
  // overlay is toggled off (otherwise toggling repeatedly leaks N listeners
  // and a single click would fire N popups).
  const overlayHandlersRef = useRef<Map<string, Array<{
    type: 'click' | 'mouseenter' | 'mouseleave'
    layerId: string
    fn: (e: any) => void
  }>>>(new Map())
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
  const [scoring, setScoring] = useState(false)
  const [layerStatus, setLayerStatus] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'missing' | 'error'>>({})
  const [error, setError] = useState<string | null>(null)

  // ── new: state selector, satellite toggle, moratoriums, parcel popup ──
  const [stateOptions, setStateOptions] = useState<StateOption[]>([])
  const [activeState, setActiveState] = useState<string>('NC')
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('dark')
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
    loading?: boolean
  } | null>(null)

  // ── init: catalog + layer list + sample sites ─────────────────────────
  const loadCatalog = useCallback(() => {
    setError(null)
    fetchSitingFactors().then(setFactorsCatalog).catch(e => setError(String(e)))
    fetchSitingLiveLayers().then(r => {
      setLayers(r.layers)
      setEnabledLayers(prev => {
        const next: Record<string, boolean> = {}
        for (const l of r.layers) next[l.key] = prev[l.key] ?? false
        return next
      })
    }).catch(e => setError(String(e)))
    fetchSitingStates().then(r => setStateOptions(r.states)).catch(() => { /* non-fatal */ })
    fetchSitingMoratoriums().then(r => setMoratoriums(r.counties)).catch(() => { /* non-fatal */ })
  }, [])

  useEffect(() => {
    loadCatalog()
    fetchSitingSample()
      .then(async (r) => {
        if (Array.isArray(r.results)) {
          const inputs = toSiteInputsFromResults(r.results)
          if (inputs.length > 0) {
            setSiteInputs(inputs)
            setSites(mergeCoordsIntoResults(r.results, inputs))
            return
          }
          const scored = await scoreSites({ sites: FALLBACK_SAMPLE_SITES, archetype })
          setSiteInputs(FALLBACK_SAMPLE_SITES)
          setSites(mergeCoordsIntoResults(scored.results, FALLBACK_SAMPLE_SITES))
          return
        }
        if (Array.isArray(r.sites) && r.sites.length > 0) {
          const scored = await scoreSites({ sites: r.sites, archetype })
          setSiteInputs(r.sites)
          setSites(mergeCoordsIntoResults(scored.results, r.sites))
        }
      })
      .catch(async () => {
        try {
          const scored = await scoreSites({
            sites: FALLBACK_SAMPLE_SITES,
            archetype,
          })
          setSiteInputs(FALLBACK_SAMPLE_SITES)
          setSites(mergeCoordsIntoResults(scored.results, FALLBACK_SAMPLE_SITES))
        } catch (e) {
          setError(String(e))
        }
      })
  }, [])

  // ── init MapLibre ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: STYLE_DARK,
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
  }, [])

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
    if (!map) return
    const SRC = `ovl-${key}-src`
    const LYR = `ovl-${key}-lyr`
    const LYR_FILL = `ovl-${key}-fill`
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
    // Send the active state filter only to layers backed by HIFLD power data
    const stateFilter = ['transmission', 'transmission_duke', 'power_plants', 'power_plants_duke'].includes(key)
      ? activeState
      : null
    // Larger limit for line layers so transmission renders contiguously
    const limit = lyr.geom === 'line' ? 12000 : 6000
    const data = await fetchSitingProxyGeoJSON(key, bbox, limit, stateFilter)
    if ('error' in data) {
      setLayerStatus(s => ({ ...s, [key]: 'error' }))
      return
    }
    const SRC = `ovl-${key}-src`
    const LYR = `ovl-${key}-lyr`
    const LYR_FILL = `ovl-${key}-fill`
    const LYR_MORATORIUM = `ovl-${key}-moratorium`
    if (map.getSource(SRC)) {
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData(data as any)
    } else {
      map.addSource(SRC, { type: 'geojson', data: data as any })
      if (lyr.geom === 'line') {
        const isVoltage = lyr.style === 'voltage' || key === 'transmission' || key === 'transmission_duke'
        map.addLayer({
          id: LYR, type: 'line', source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': isVoltage ? VOLTAGE_COLOR_EXPR : lyr.color,
            'line-width': isVoltage ? VOLTAGE_WIDTH_EXPR : 1.2,
            'line-opacity': 0.92,
          },
        }, 'sites-halo')
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
        }, 'sites-halo')
      } else {
        // polygon
        map.addLayer({
          id: LYR_FILL, type: 'fill', source: SRC,
          paint: { 'fill-color': lyr.color, 'fill-opacity': 0.10 },
        }, 'sites-halo')
        // Light-red highlight for counties with documented opposition
        if (key === 'county_subdivisions' && moratoriumKeys.length) {
          const filterMatches: any[] = ['any']
          for (const c of moratoriums) {
            filterMatches.push([
              'all',
              ['==', ['get', 'STATE_NAME'], c.state],
              ['==', ['get', 'NAME'], c.county],
            ])
          }
          map.addLayer({
            id: LYR_MORATORIUM, type: 'fill', source: SRC,
            filter: filterMatches as any,
            paint: { 'fill-color': '#ff6b6b', 'fill-opacity': 0.32 },
          }, 'sites-halo')
        }
        map.addLayer({
          id: LYR, type: 'line', source: SRC,
          paint: { 'line-color': lyr.color, 'line-width': 0.9, 'line-opacity': 0.85 },
        }, 'sites-halo')
        // Click → parcel popup with proximity stats
        if (key === 'nc_parcels' || key === 'nc_parcels_pts') {
          const onClick = (e: any) => {
            const f = e.features?.[0]
            if (!f) return
            setParcelPopup({
              lat: e.lngLat.lat,
              lon: e.lngLat.lng,
              props: f.properties as Record<string, unknown>,
              loading: true,
            })
            fetchParcelDetail(e.lngLat.lat, e.lngLat.lng).then(d => {
              if ('error' in d) {
                setParcelPopup(p => p && { ...p, loading: false })
                return
              }
              setParcelPopup(p => p && { ...p, detail: d, loading: false })
            })
          }
          const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
          const onLeave = () => { map.getCanvas().style.cursor = '' }
          map.on('click', LYR, onClick)
          map.on('mouseenter', LYR, onEnter)
          map.on('mouseleave', LYR, onLeave)
          overlayHandlersRef.current.set(key, [
            { type: 'click', layerId: LYR, fn: onClick },
            { type: 'mouseenter', layerId: LYR, fn: onEnter },
            { type: 'mouseleave', layerId: LYR, fn: onLeave },
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
      if (next[key]) reloadOverlay(key)
      else removeOverlay(key)
      return next
    })
  }

  // refetch enabled overlays when bbox changes (debounced via dependency)
  useEffect(() => {
    if (!mapReady || !bbox) return
    for (const [key, on] of Object.entries(enabledLayers)) {
      if (on) reloadOverlay(key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox?.[0], bbox?.[1], bbox?.[2], bbox?.[3], mapReady])

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
    // Force enabled overlays to re-fetch with new state filter
    setTimeout(() => {
      for (const [key, on] of Object.entries(enabledLayers)) {
        if (on) reloadOverlay(key)
      }
    }, 900)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState, stateOptions, mapReady])

  // ── switch basemap (dark ↔ satellite) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const target = basemap === 'satellite' ? STYLE_SATELLITE : STYLE_DARK
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
    if (siteInputs.length === 0) return
    setScoring(true)
    setError(null)
    try {
      const r = await scoreSites({
        sites: siteInputs,
        archetype,
        weight_overrides: Object.keys(weightOverrides).length ? weightOverrides : undefined,
      })
      setSites(mergeCoordsIntoResults(r.results, siteInputs))
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

  function fitToSites() {
    const map = mapRef.current
    if (!map || sites.length === 0) return
    let xmin = 180, ymin = 90, xmax = -180, ymax = -90
    for (const s of sites) {
      if (s.lon < xmin) xmin = s.lon
      if (s.lon > xmax) xmax = s.lon
      if (s.lat < ymin) ymin = s.lat
      if (s.lat > ymax) ymax = s.lat
    }
    const bounds: LngLatBoundsLike = [[xmin, ymin], [xmax, ymax]]
    map.fitBounds(bounds, { padding: 80, duration: 800 })
  }

  const ranked = useMemo(
    () => [...sites].sort((a, b) => b.composite - a.composite),
    [sites],
  )

  const factorList = factorsCatalog?.factors ?? []
  const baseWeights = factorsCatalog?.weights[archetype] ?? {}

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
          <span className="siting-sub">14-factor composite · public data</span>
        </div>

        <section className="siting-block">
          <div className="siting-block-head">ARCHETYPE</div>
          <div className="archetype-row">
            {ARCHETYPES.map(a => (
              <button
                key={a}
                className={`arch-btn ${archetype === a ? 'active' : ''}`}
                onClick={() => setArchetype(a)}
              >{a.toUpperCase()}</button>
            ))}
          </div>
        </section>

        <section className="siting-block">
          <div className="siting-block-head">STATE</div>
          <div className="state-row">
            <select
              className="state-select"
              value={activeState}
              onChange={(e) => setActiveState(e.target.value)}
            >
              {stateOptions.length === 0 ? (
                <option value="NC">NC</option>
              ) : (
                <>
                  <optgroup label="Duke territory">
                    {stateOptions.filter(s => s.duke).map(s => (
                      <option key={s.code} value={s.code}>{s.code}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Other">
                    {stateOptions.filter(s => !s.duke).map(s => (
                      <option key={s.code} value={s.code}>{s.code}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
            <span className="state-hint">filters power layers + flies map</span>
          </div>
        </section>

        <section className="siting-block">
          <div className="siting-block-head">
            <span>OVERLAYS · LIVE</span>
            <span className="siting-block-meta">z{zoom.toFixed(1)} · bbox</span>
          </div>
          {Object.entries(
            layers.reduce<Record<string, LiveLayer[]>>((acc, l) => {
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
                    <li key={l.key} className={`layer-row ${enabledLayers[l.key] ? 'on' : ''}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!enabledLayers[l.key]}
                          onChange={() => toggleLayer(l.key)}
                        />
                        <span className="layer-dot" style={{ background: l.color }} />
                        <span className="layer-name">{l.name}</span>
                      </label>
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

        <section className="siting-block">
          <div className="siting-block-head">
            <span>WEIGHTS · {archetype}</span>
            <button className="link-btn" onClick={resetWeights}>reset</button>
          </div>
          <div className="weight-list">
            {factorList.map(f => {
              const base = baseWeights[f] ?? 0
              const cur = weightOverrides[f] ?? base
              return (
                <div key={f} className="weight-row">
                  <div className="weight-row-head">
                    <span className="factor-name">{f}</span>
                    <span className="factor-val">{(cur * 100).toFixed(0)}</span>
                  </div>
                  <input
                    type="range" min={0} max={0.30} step={0.01}
                    value={cur}
                    onChange={(e) => setWeight(f, parseFloat(e.target.value))}
                  />
                </div>
              )
            })}
          </div>
          <button className="primary-btn" onClick={rescoreAll} disabled={scoring}>
            {scoring ? 'SCORING…' : 'RESCORE'}
          </button>
        </section>

        {error && (
          <div className="siting-err">
            <span>{error}</span>
            <button className="link-btn" onClick={loadCatalog}>retry</button>
          </div>
        )}
      </aside>

      {/* ── Map ── */}
      <div className="siting-mapwrap">
        <div ref={mapDivRef} className="siting-map" />
        <div className="map-toolbar">
          <button onClick={fitToSites}>FIT</button>
          <button
            className={basemap === 'satellite' ? 'active' : ''}
            onClick={() => setBasemap(b => b === 'dark' ? 'satellite' : 'dark')}
          >{basemap === 'satellite' ? 'DARK' : 'SAT'}</button>
          <span className="bbox-readout">
            {bbox && `${bbox[1].toFixed(2)}°N ${bbox[0].toFixed(2)}°E → ${bbox[3].toFixed(2)}°N ${bbox[2].toFixed(2)}°E`}
          </span>
        </div>
        {parcelPopup && (
          <div className="parcel-popup">
            <div className="parcel-popup-head">
              <span>PARCEL</span>
              <button className="link-btn" onClick={() => setParcelPopup(null)}>×</button>
            </div>
            <div className="parcel-popup-body">
              <div className="parcel-row">
                <span>owner</span>
                <span>{String(parcelPopup.props.ownname ?? parcelPopup.props.OWNNAME ?? '—')}</span>
              </div>
              <div className="parcel-row">
                <span>parcel #</span>
                <span>{String(parcelPopup.props.parno ?? parcelPopup.props.PARNO ?? '—')}</span>
              </div>
              {(() => {
                const p = parcelPopup.props as Record<string, unknown>
                const acres = p.deedacres ?? p.DEEDACRES ?? p.calc_acres ?? p.CALC_ACRES ?? p.acres ?? p.ACRES
                return (
                  <div className="parcel-row">
                    <span>acreage</span>
                    <span>{acres == null ? '—' : Number(acres).toFixed(2)}</span>
                  </div>
                )
              })()}
              <div className="parcel-row">
                <span>improvement $</span>
                <span>{(() => {
                  const v = parcelPopup.props.improvval ?? parcelPopup.props.IMPROVVAL
                  return v == null ? '—' : `$${Number(v).toLocaleString()}`
                })()}</span>
              </div>
              <div className="parcel-row">
                <span>location</span>
                <span>{parcelPopup.lat.toFixed(4)}°, {parcelPopup.lon.toFixed(4)}°</span>
              </div>
              <div className="parcel-section">PROXIMITY</div>
              {parcelPopup.loading && <div className="parcel-row"><span>computing…</span></div>}
              {parcelPopup.detail?.results.map(r => (
                <div className="parcel-row" key={r.layer}>
                  <span>{r.label}</span>
                  <span>{r.distance_mi == null ? '— (none in 5 mi)' : `${r.distance_mi} mi`}</span>
                </div>
              ))}
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
          <span className="siting-title">RANKED · {ranked.length}</span>
          <span className="siting-sub">{archetype}</span>
        </div>
        <ol className="rank-list">
          {ranked.map((s, i) => {
            const killed = Object.values(s.kill_flags).some(Boolean)
            return (
              <li
                key={s.site_id}
                className={`rank-row ${selectedId === s.site_id ? 'sel' : ''} ${killed ? 'killed' : ''}`}
                onClick={() => flyTo(s)}
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
    </div>
  )
}
