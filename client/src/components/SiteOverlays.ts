// SiteOverlays.ts
// ---------------------------------------------------------------------------
// User-uploaded KMZ/KML overlays + on-map drawing + annotations.
// All logic is hand-rolled against MapLibre's native click events so we avoid
// the @mapbox/mapbox-gl-draw vs MapLibre 5.x compatibility headache and keep
// the bundle slim. Three feature buckets, each backed by its own GeoJSON
// source/layer trio (fill / line / circle):
//
//   - imports : features parsed from a user-supplied KMZ/KML file
//   - drawn   : features the user drew interactively (point/line/polygon)
//
// Annotations (text labels) ride on the `drawn` source via a `label` property
// rendered through a symbol layer.
// ---------------------------------------------------------------------------
import maplibregl, { Map as MLMap } from 'maplibre-gl'
import JSZip from 'jszip'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'

// ── KMZ / KML parsing ───────────────────────────────────────────────────────

export type ParsedOverlay = {
  name: string
  fc: GeoJSON.FeatureCollection
}

export async function parseKmzOrKml(file: File): Promise<ParsedOverlay> {
  const lower = file.name.toLowerCase()
  let kmlText: string
  if (lower.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    // KMZ archives put the KML at doc.kml or the first .kml entry.
    const entry =
      zip.file(/(^|\/)doc\.kml$/i)[0] ?? zip.file(/\.kml$/i)[0] ?? null
    if (!entry) throw new Error('KMZ contains no .kml document')
    kmlText = await entry.async('string')
  } else if (lower.endsWith('.kml')) {
    kmlText = await file.text()
  } else if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    const txt = await file.text()
    const fc = JSON.parse(txt) as GeoJSON.FeatureCollection
    return { name: file.name, fc }
  } else {
    throw new Error('Unsupported file type — use .kmz, .kml, or .geojson')
  }

  const dom = new DOMParser().parseFromString(kmlText, 'text/xml')
  const fc = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
  if (!fc?.features?.length) throw new Error('KML contained no features')
  return { name: file.name, fc }
}

export function bboxOfFC(fc: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (coord: any) => {
    if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      if (coord[0] < minX) minX = coord[0]
      if (coord[0] > maxX) maxX = coord[0]
      if (coord[1] < minY) minY = coord[1]
      if (coord[1] > maxY) maxY = coord[1]
    } else {
      for (const c of coord) visit(c)
    }
  }
  for (const f of fc.features) {
    if (f.geometry && (f.geometry as any).coordinates) {
      visit((f.geometry as any).coordinates)
    }
  }
  if (!Number.isFinite(minX)) return null
  return [minX, minY, maxX, maxY]
}

// ── Source / layer plumbing ─────────────────────────────────────────────────

export const IMPORT_SRC = 'avalon-import-src'
export const IMPORT_FILL = 'avalon-import-fill'
export const IMPORT_LINE = 'avalon-import-line'
export const IMPORT_PT = 'avalon-import-pt'
export const IMPORT_LBL = 'avalon-import-lbl'

export const DRAWN_SRC = 'avalon-drawn-src'
export const DRAWN_FILL = 'avalon-drawn-fill'
export const DRAWN_LINE = 'avalon-drawn-line'
export const DRAWN_PT = 'avalon-drawn-pt'
export const DRAWN_LBL = 'avalon-drawn-lbl'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function ensureOverlayLayers(map: MLMap): void {
  // imports — cyan
  if (!map.getSource(IMPORT_SRC)) {
    map.addSource(IMPORT_SRC, { type: 'geojson', data: EMPTY_FC })
    map.addLayer({
      id: IMPORT_FILL, type: 'fill', source: IMPORT_SRC,
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'fill-color': '#00d9ff', 'fill-opacity': 0.18 },
    })
    map.addLayer({
      id: IMPORT_LINE, type: 'line', source: IMPORT_SRC,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']]],
      paint: {
        'line-color': '#00d9ff',
        'line-width': 2,
        'line-dasharray': [2, 2] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number[]>,
      },
    })
    map.addLayer({
      id: IMPORT_PT, type: 'circle', source: IMPORT_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#00d9ff',
        'circle-stroke-color': '#0a0a0a',
        'circle-stroke-width': 1.4,
      },
    })
    map.addLayer({
      id: IMPORT_LBL, type: 'symbol', source: IMPORT_SRC,
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ['get', 'Name'], ''],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#e6f7ff',
        'text-halo-color': '#000',
        'text-halo-width': 1.2,
      },
    })
  }
  // drawn — amber
  if (!map.getSource(DRAWN_SRC)) {
    map.addSource(DRAWN_SRC, { type: 'geojson', data: EMPTY_FC })
    map.addLayer({
      id: DRAWN_FILL, type: 'fill', source: DRAWN_SRC,
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'fill-color': '#ffb300', 'fill-opacity': 0.22 },
    })
    map.addLayer({
      id: DRAWN_LINE, type: 'line', source: DRAWN_SRC,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']]],
      paint: { 'line-color': '#ffb300', 'line-width': 2.4 },
    })
    map.addLayer({
      id: DRAWN_PT, type: 'circle', source: DRAWN_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 7,
        'circle-color': '#ffb300',
        'circle-stroke-color': '#000',
        'circle-stroke-width': 1.6,
      },
    })
    map.addLayer({
      id: DRAWN_LBL, type: 'symbol', source: DRAWN_SRC,
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ''],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffe6a8',
        'text-halo-color': '#000',
        'text-halo-width': 1.4,
      },
    })
  }
}

export function setSourceData(
  map: MLMap,
  sourceId: string,
  fc: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  if (src) src.setData(fc)
}

// ── Drawing controller ──────────────────────────────────────────────────────

export type DrawMode = 'none' | 'point' | 'line' | 'polygon'

export type DrawnFeature = GeoJSON.Feature<GeoJSON.Geometry, {
  id: string
  kind: 'point' | 'line' | 'polygon'
  label: string
  notes?: string
  created: number
}>

export class DrawController {
  private map: MLMap
  private mode: DrawMode = 'none'
  private features: DrawnFeature[] = []
  private inProgress: number[][] = []
  private onChange: (fs: DrawnFeature[]) => void
  private clickHandler: (e: maplibregl.MapMouseEvent) => void
  private dblHandler: (e: maplibregl.MapMouseEvent) => void
  private moveHandler: (e: maplibregl.MapMouseEvent) => void

  constructor(map: MLMap, onChange: (fs: DrawnFeature[]) => void) {
    this.map = map
    this.onChange = onChange
    this.clickHandler = (e) => this.handleClick(e)
    this.dblHandler = (e) => this.handleDblClick(e)
    this.moveHandler = (e) => this.handleMouseMove(e)
    map.on('click', this.clickHandler)
    map.on('dblclick', this.dblHandler)
    map.on('mousemove', this.moveHandler)
  }

  destroy(): void {
    this.map.off('click', this.clickHandler)
    this.map.off('dblclick', this.dblHandler)
    this.map.off('mousemove', this.moveHandler)
  }

  setMode(mode: DrawMode): void {
    this.mode = mode
    this.inProgress = []
    this.map.getCanvas().style.cursor = mode === 'none' ? '' : 'crosshair'
    this.map.doubleClickZoom[mode === 'none' ? 'enable' : 'disable']()
    this.render()
  }

  getFeatures(): DrawnFeature[] {
    return this.features
  }

  setFeatures(fs: DrawnFeature[]): void {
    this.features = fs
    this.render()
    this.onChange(this.features)
  }

  removeFeature(id: string): void {
    this.features = this.features.filter((f) => f.properties.id !== id)
    this.render()
    this.onChange(this.features)
  }

  updateLabel(id: string, label: string, notes?: string): void {
    const f = this.features.find((x) => x.properties.id === id)
    if (!f) return
    f.properties.label = label
    if (notes !== undefined) f.properties.notes = notes
    this.render()
    this.onChange(this.features)
  }

  clearAll(): void {
    this.features = []
    this.inProgress = []
    this.render()
    this.onChange(this.features)
  }

  private newId(): string {
    return `dr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`
  }

  private handleClick(e: maplibregl.MapMouseEvent): void {
    if (this.mode === 'none') return
    e.preventDefault()
    const lon = e.lngLat.lng
    const lat = e.lngLat.lat
    if (this.mode === 'point') {
      const f: DrawnFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { id: this.newId(), kind: 'point', label: 'Marker', created: Date.now() },
      }
      this.features.push(f)
      this.render()
      this.onChange(this.features)
      return
    }
    this.inProgress.push([lon, lat])
    this.render()
  }

  private handleDblClick(e: maplibregl.MapMouseEvent): void {
    if (this.mode === 'none' || this.mode === 'point') return
    e.preventDefault()
    if (this.inProgress.length < 2) {
      this.inProgress = []
      this.render()
      return
    }
    if (this.mode === 'line') {
      const f: DrawnFeature = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [...this.inProgress] },
        properties: { id: this.newId(), kind: 'line', label: 'Line', created: Date.now() },
      }
      this.features.push(f)
    } else if (this.mode === 'polygon') {
      if (this.inProgress.length < 3) {
        this.inProgress = []
        this.render()
        return
      }
      const ring = [...this.inProgress, this.inProgress[0]]
      const f: DrawnFeature = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { id: this.newId(), kind: 'polygon', label: 'Polygon', created: Date.now() },
      }
      this.features.push(f)
    }
    this.inProgress = []
    this.render()
    this.onChange(this.features)
  }

  private handleMouseMove(_e: maplibregl.MapMouseEvent): void {
    // We could render a "ghost" segment; skipped to keep the map quiet.
  }

  private render(): void {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.features as GeoJSON.Feature[],
    }
    // In-progress preview — render as a temporary line/polygon outline
    if (this.inProgress.length >= 2) {
      if (this.mode === 'polygon' && this.inProgress.length >= 3) {
        const ring = [...this.inProgress, this.inProgress[0]]
        fc.features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { id: '__preview__', kind: 'polygon', label: '', created: 0 },
        })
      } else {
        fc.features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [...this.inProgress] },
          properties: { id: '__preview__', kind: 'line', label: '', created: 0 },
        })
      }
    }
    if (this.inProgress.length >= 1) {
      for (const [lon, lat] of this.inProgress) {
        fc.features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { id: '__vertex__', kind: 'point', label: '', created: 0 },
        })
      }
    }
    setSourceData(this.map, DRAWN_SRC, fc)
  }
}

// ── 3D terrain ──────────────────────────────────────────────────────────────
// Uses AWS Open Data Terrarium tiles (no key, free, attribution required).
// Terrarium PNGs encode elevation in RGB; MapLibre supports this natively.

export const TERRAIN_SRC = 'avalon-terrain-dem'
const TERRAIN_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
]
const TERRAIN_ATTR = 'Terrain © <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>'

export function enableTerrain(map: MLMap, exaggeration = 1.4): void {
  if (!map.getSource(TERRAIN_SRC)) {
    map.addSource(TERRAIN_SRC, {
      type: 'raster-dem',
      tiles: TERRAIN_TILES,
      tileSize: 256,
      maxzoom: 14,
      encoding: 'terrarium',
      attribution: TERRAIN_ATTR,
    } as maplibregl.RasterDEMSourceSpecification)
  }
  map.setTerrain({ source: TERRAIN_SRC, exaggeration })
  // Drop a soft sky for nicer perspective.
  if (!map.getLayer('avalon-sky')) {
    try {
      map.addLayer({ id: 'avalon-sky', type: 'sky', paint: { 'sky-type': 'atmosphere' } } as any)
    } catch { /* sky type unsupported on this style — non-fatal */ }
  }
  if (map.getPitch() < 5) map.easeTo({ pitch: 55, duration: 600 })
}

export function disableTerrain(map: MLMap): void {
  try { map.setTerrain(null) } catch { /* noop */ }
  if (map.getLayer('avalon-sky')) map.removeLayer('avalon-sky')
  if (map.getPitch() > 0) map.easeTo({ pitch: 0, bearing: 0, duration: 500 })
}

// ── 3D buildings ────────────────────────────────────────────────────────────
// OpenFreeMap (free, no key) hosts OpenMapTiles-schema vector tiles whose
// `building` source-layer carries `render_height` / `render_min_height`
// fields populated from OSM `height`, `building:levels`, etc. We pull just
// that single source-layer and extrude it client-side, which works on top
// of any current basemap (raster USGS imagery, dark MapLibre style, etc.).

export const BUILDINGS_SRC = 'avalon-openfreemap'
export const BUILDINGS_LYR = 'avalon-3d-buildings'
const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet'
const OPENFREEMAP_ATTR = '© <a href="https://openfreemap.org">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export function enable3DBuildings(map: MLMap): void {
  if (!map.getSource(BUILDINGS_SRC)) {
    map.addSource(BUILDINGS_SRC, {
      type: 'vector',
      url: OPENFREEMAP_TILEJSON,
      attribution: OPENFREEMAP_ATTR,
    } as maplibregl.VectorSourceSpecification)
  }
  if (!map.getLayer(BUILDINGS_LYR)) {
    map.addLayer({
      id: BUILDINGS_LYR,
      type: 'fill-extrusion',
      source: BUILDINGS_SRC,
      'source-layer': 'building',
      minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'],
          ['coalesce', ['get', 'render_height'], 6],
          0,   '#7d8aa0',
          15,  '#9aa6bd',
          40,  '#c2cee0',
          90,  '#e6eef8',
          200, '#ffffff',
        ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          13,    0,
          13.5,  ['coalesce', ['get', 'render_height'], 6],
        ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
        'fill-extrusion-base': [
          'coalesce', ['get', 'render_min_height'], 0,
        ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    } as maplibregl.FillExtrusionLayerSpecification)
  }
  // Caller is responsible for flying to a useful zoom/center.
}

export function disable3DBuildings(map: MLMap): void {
  if (map.getLayer(BUILDINGS_LYR)) map.removeLayer(BUILDINGS_LYR)
  if (map.getSource(BUILDINGS_SRC)) map.removeSource(BUILDINGS_SRC)
}

// ── Export helpers ──────────────────────────────────────────────────────────

export function downloadGeoJSON(fc: GeoJSON.FeatureCollection, filename: string): void {
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
