# Avalon - Next High-Impact Value-Add Items (Priority Order)

## Phase 2 - COMPLETE ✅
- ✅ Site details modal with 14-factor breakdown
- ✅ Parcel map click popup  
- ✅ GeoJSON + CSV export functionality

---

## Phase 3 - Recommended Next Items

### Priority 1: Real Factor Scoring (HIGH IMPACT, 4-8 hours)
**Strategic Importance**: HIGH - Makes tool production-ready for actual site screening workflows

**Current State**: All 14 factors return stub value of ~5.0. Actual scoring not implemented.

**What's Needed**:
1. **Labor Factor** (2 hrs)
   - Integrate BLS employment data via `/api/siting/labor` endpoint
   - Query by county/MSA for wage, unemployment, labor availability metrics
   - Normalize [0-1] based on industry benchmarks
   - Depends on: BLS data ingest (scoring/src/ingest/bls.py)

2. **Climate Factor** (1.5 hrs)
   - Integrate NOAA climate data: cooling degree days, heating degree days, precipitation
   - Query by site coordinates (lat/lon)
   - Normalize based on datacenter cooling efficiency curves
   - Depends on: NOAA data ingest (scoring/src/ingest/noaa.py)

3. **Permitting Factor** (1.5 hrs)
   - Query state permitting databases for typical timeline, complexity, cost
   - Flag counties with streamlined processes vs high barriers
   - Normalize based on typical timeline days
   - Depends on: State permitting data ingest

4. **Hazard Factor** (1 hr)
   - Already have FEMA flood zones visible on map
   - Hazard = composite of: flood risk, tornado frequency, earthquake risk, wildfire proximity
   - Normalize [0-1] based on insurable loss probability
   - Depends on: FEMA, USGS data (mostly already ingested)

**Implementation Path**:
1. Verify upstream data is available in `scoring/data/raw/`
2. Uncomment/implement factor logic in `scoring/src/factors/{labor,climate,permitting,hazard}.py`
3. Add `/api/siting/factors` endpoint to server to expose factor calculations
4. Wire modal to fetch real factor values instead of stubs
5. Test with sample sites

**Files to Modify**:
- `server/main.py` - Add factor computation endpoints
- `scoring/src/factors/{labor,climate,permitting,hazard}.py` - Implement logic
- `client/src/api.ts` - Add factor fetch functions
- `client/src/components/SiteDetailsModal.tsx` - Switch from stubs to real values

**Expected Outcome**: 
- Modal shows real, data-driven factor scores
- Sites ranked by actual infrastructure/permitting/climate/labor suitability
- Tool becomes viable for production site screening workflows

---

### Priority 2: Batch Site Analysis (MEDIUM IMPACT, 2-3 hours)
**Strategic Importance**: MEDIUM - Enables portfolio-level analysis

**What's Needed**:
- Upload CSV with candidate sites (lat/lon or address)
- Bulk score all sites against factors
- Download results with comparison
- Compare multiple portfolios side-by-side

**Implementation Path**:
1. Add file upload zone to left sidebar
2. Parse CSV, validate lat/lon
3. Bulk call `/api/siting/score` for all sites
4. Display comparison table with filtering/sorting
5. Export results

**Files to Modify**:
- `client/src/components/SitingPanel.tsx` - Add upload zone
- `server/main.py` - Add bulk scoring endpoint
- `client/src/components/BatchAnalysisPanel.tsx` - New component

---

### Priority 3: Advanced Export Formats (LOW IMPACT, 1-2 hours)
**Strategic Importance**: LOW - Nice-to-have for GIS workflows

**What's Needed**:
- Shapefile export (with attribute data)
- GeoPackage export (single-file geodatabase)
- KML export (Google Earth compatible)

**Implementation Path**:
1. Use `fiona` library (already available) to write Shapefile
2. Use `gpkg` support in `fiona` for GeoPackage
3. Use `simplekml` for KML generation
4. Add export format selector to existing export buttons

---

### Priority 4: Real-Time Collaboration (VERY HIGH COMPLEXITY, 6-8 hours)
**Strategic Importance**: MEDIUM - Enables team workflows

**What's Needed**:
- Multiple users can view same map simultaneously
- Changes to weights/filters sync in real-time
- Comments/annotations on sites
- Share analysis snapshots via URL

**Implementation Path**:
1. Add WebSocket server (FastAPI websockets)
2. Broadcast map state changes to all connected clients
3. Add comment panel to site details modal
4. Implement session/sharing URL scheme

**Note**: This is complex and may not be priority unless team collaboration is needed immediately.

---

## Estimated Timeline for Phase 3

- **Priority 1 (Real Scoring)**: 4-8 hrs → **CRITICAL PATH**
- **Priority 2 (Batch Analysis)**: 2-3 hrs → After Priority 1
- **Priority 3 (Advanced Exports)**: 1-2 hrs → Can do in parallel with Priority 2
- **Priority 4 (Collaboration)**: 6-8 hrs → Only if needed

**Recommended Next Step**: Start with Priority 1 (Real Factor Scoring). This unlocks production viability and enables validation against real-world site selections.

---

## Current Blockers / Dependencies

1. **Upstream Data Availability**: Verify BLS, NOAA, state permitting data is complete in `scoring/data/raw/`
2. **Factor Implementation**: Check `scoring/src/factors/` for existing code vs stubs
3. **API Coverage**: Confirm `/api/siting/score` endpoint exists and can compute factors

---

Generated: 2026-04-23
