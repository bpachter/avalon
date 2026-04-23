# Phase 2 Technical Integration Guide

**For**: Developers integrating Avalon Phase 2 features
**Created**: 2026-04-23

---

## Frontend Architecture

### Component Tree
```
App.tsx
├── ThemeProvider (MUI 9)
├── AppBar
├── SitingPanel.tsx (1730 lines)
│   ├── Map (MapLibre GL)
│   ├── Controls (state, layer toggles, rescore)
│   ├── Ranked Sites List
│   ├── SiteDetailsModal.tsx (NEW - 280 lines)
│   └── Export Buttons (NEW - lines 1612, 1656)
└── Footer
```

### State Management

**SitingPanel state variables** (relevant to Phase 2):
```typescript
const [detailSite, setDetailSite] = useState<SiteResultDTO | null>(null)
const [detailOpen, setDetailOpen] = useState(false)
const [sites, setSites] = useState<SiteResultDTO[]>([])
const [activeState, setActiveState] = useState<string>('NC')
```

**Data Flow**:
1. User clicks ranked site
2. `onClick` → `flyTo(site)` + `setDetailSite(site)` + `setDetailOpen(true)`
3. `SiteDetailsModal` receives props, renders Drawer
4. User clicks close button → `onClose()` → `setDetailOpen(false)`
5. User clicks export button → generates client-side data → browser downloads file

---

## Component APIs

### SiteDetailsModal

**Props**:
```typescript
interface SiteDetailsModalProps {
  site: SiteResultDTO | null      // Null → component returns null (no render)
  open: boolean                   // Controls Drawer visibility
  onClose: () => void             // Called when user closes modal
}
```

**Accepts**: [client/src/api.ts](client/src/api.ts) `SiteResultDTO`
```typescript
interface SiteResultDTO {
  site_id: string
  lat: number
  lon: number
  composite: number                     // 0-10 score
  factors: Record<string, FactorResultDTO>
  kill_flags: Record<string, boolean>   // e.g., { "power_transmission": true }
  imputed: string[]                     // Factors using cohort median
  archetype: string
  // ... other fields
}

interface FactorResultDTO {
  normalized: number          // [0-1]
  weighted: number            // normalized * weight
  weight: number              // Factor weighting
  killed: boolean             // Factor eliminated site?
  stub: boolean               // Data imputed?
  raw_value?: number          // Original data value (if available)
  provenance: Record<string, any>
}
```

**Color Gradient**:
- `normalized` [0.0 - 0.5] → Red → Amber
- `normalized` [0.5 - 1.0] → Amber → Green
- Handled by `factorColor()` function (RGB interpolation)

---

### Export Handlers

**GeoJSON Export** (lines 1612-1654):
```typescript
onClick={() => {
  // 1. Build RFC 7946 FeatureCollection
  const features = displayedRanked.map(s => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: {
      site_id: s.site_id,
      composite: s.composite,
      ...Object.fromEntries(
        Object.entries(s.factors).map(([k, f]) => 
          [`${k}_normalized`, f.normalized]
        )
      )
    }
  }))
  
  const fc = { type: 'FeatureCollection', features }
  
  // 2. Download
  const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `avalon-sites-${activeState}-${date}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}}
```

**CSV Export** (lines 1656-1690):
```typescript
onClick={() => {
  // 1. Build headers
  const headers = ['site_id', 'latitude', 'longitude', 'composite', 'killed', 
    ...Object.keys(displayedRanked[0]?.factors || {})]
  
  // 2. Build rows with escaping
  const escapeCsvField = (v: any) => {
    const str = String(v)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  
  const rows = displayedRanked.map(s => [
    s.site_id, s.lat, s.lon, s.composite,
    Object.values(s.kill_flags).some(Boolean) ? 'YES' : 'NO',
    ...Object.entries(s.factors).map(([, f]) => f.normalized.toFixed(3))
  ])
  
  // 3. Create CSV string
  const csv = [
    headers.map(escapeCsvField).join(','),
    ...rows.map(r => r.map(escapeCsvField).join(','))
  ].join('\n')
  
  // 4. Download
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `avalon-sites-${activeState}-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}}
```

---

## Backend Integration

### Required Endpoints

**Score Sites**
```
POST /api/siting/score
Content-Type: application/json

{
  "sites": [
    {"site_id": "site_001", "lat": 35.9, "lon": -78.6},
    {"site_id": "site_002", "lat": 36.1, "lon": -78.5}
  ],
  "archetype": "training",
  "weight_overrides": {}
}

Response: 200 OK
{
  "results": [
    {
      "site_id": "site_001",
      "lat": 35.9,
      "lon": -78.6,
      "composite": 7.5,
      "factors": {
        "power_transmission": {
          "normalized": 0.8,
          "weighted": 0.12,
          "weight": 0.15,
          "killed": false,
          "stub": false
        },
        // ... 13 more factors
      },
      "kill_flags": {"power_transmission": false, ...},
      "imputed": [],
      "archetype": "training"
    },
    // ... more sites
  ]
}
```

**Proxy GeoJSON** (for map layers)
```
GET /api/siting/proxy?layer=transmission&bbox=-80,-40,80,40&limit=100&state=NC&zoom=6

Response: 200 OK
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "feature_id",
      "geometry": {"type": "LineString", "coordinates": [...]},
      "properties": {...}
    },
    // ...
  ],
  "_meta": {
    "layer": "transmission",
    "bbox": [-80, -40, 80, 40],
    "limit": 100,
    "state": "NC",
    "zoom": 6,
    "cache": "hit"
  }
}
```

---

## MUI 9 Compatibility Notes

### Stack Component Removed
❌ **Don't use**: `<Stack direction="row" spacing={2}>`
✅ **Use instead**: 
```tsx
<Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'center' }}>
```

### Drawer PaperProps Changed
❌ **Don't use**: `<Drawer PaperProps={{ sx: {...} }} />`
✅ **Use instead**:
```tsx
<Drawer slotProps={{ paper: { sx: {...} } }} />
```

### Button Theme Overrides
❌ **Don't use**:
```tsx
MuiButton: {
  styleOverrides: {
    containedPrimary: { /* ... */ }
  }
}
```

✅ **Use instead**:
```tsx
MuiButton: {
  styleOverrides: {
    root: {
      '&.MuiButton-containedPrimary': { /* ... */ }
    }
  }
}
```

### LinearProgress Typings
❌ **Avoid**: `<LinearProgress variant="determinate" value={50} />`
✅ **Use manual Box**:
```tsx
<Box sx={{ height: 6, bgcolor: '#333', overflow: 'hidden' }}>
  <Box sx={{ height: '100%', width: '50%', bgcolor: '#ff9500' }} />
</Box>
```

---

## Testing Checklist

### Functional Tests
- [ ] Click ranked site → Modal opens on right
- [ ] Modal displays all 14 factors sorted by contribution
- [ ] Factors color-coded: red/amber/green by value
- [ ] Kill flags display in red chips
- [ ] Imputed fields display in amber chips
- [ ] Close modal (X button) works
- [ ] Click outside modal closes it
- [ ] Click GeoJSON button → downloads `.geojson` file
- [ ] Click CSV button → downloads `.csv` file
- [ ] GeoJSON file opens in QGIS without errors
- [ ] CSV file opens in Excel without formatting issues

### Edge Cases
- [ ] Export with commas in field values
- [ ] Export with quotes in field values
- [ ] Export with newlines in field values
- [ ] Export with 1 site
- [ ] Export with 1000 sites
- [ ] Modal with no factors defined
- [ ] Modal with all factors killed
- [ ] Modal with no kill flags

### Performance
- [ ] Modal opens < 100ms
- [ ] Export downloads < 500ms
- [ ] No memory leaks when opening/closing modal repeatedly
- [ ] CSV < 10MB for 1000 sites
- [ ] GeoJSON < 10MB for 1000 sites

---

## Troubleshooting

### Modal doesn't appear
1. Check `detailSite` is not null
2. Check `detailOpen` is true
3. Check SiteDetailsModal is imported at top of SitingPanel
4. Check browser console for React errors

### Export button does nothing
1. Check `displayedRanked` has sites
2. Check browser allows downloads
3. Check available disk space
4. Check browser console for errors

### Export file is empty
1. Verify `sites` array has data
2. Check `factors` object is populated
3. Verify `site.lat`, `site.lon` are numbers

---

## Files Modified in Phase 2

| File | Lines | Changes |
|------|-------|---------|
| `client/src/components/SiteDetailsModal.tsx` | 280 | NEW component |
| `client/src/components/SitingPanel.tsx` | 1730 | Lines 22 (import), 408-409 (state), 1711 (click handler), 1612/1656 (export buttons) |
| `client/src/theme.ts` | - | Uses existing `avalonPalette` |
| `server/main.py` | - | No changes to Phase 2 features |

---

**Version**: Phase 2 - Production Ready
**Last Updated**: 2026-04-23
