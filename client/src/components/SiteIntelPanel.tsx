import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import type { SiteResultDTO } from '../api'
import { avalonPalette } from '../theme'
import { DEEP_DIVE_BUILDING_PALETTE } from './SiteOverlays'

// ── Shared text styles ──────────────────────────────────────────────────────

const S_SECTION_HEAD = {
  fontFamily: '"VT323", monospace',
  fontSize: 10,
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: avalonPalette.cyan,
  mb: 1.25,
}

const S_SUB_HEAD = {
  fontFamily: '"VT323", monospace',
  fontSize: 9,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: avalonPalette.amberDim,
  mb: 0.75,
}

const S_KEY: React.CSSProperties = {
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 10,
  color: avalonPalette.whiteDim,
  minWidth: 128,
  flexShrink: 0,
}

const S_VAL: React.CSSProperties = {
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 10,
  color: '#d7e2ff',
  flex: 1,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function prov(site: SiteResultDTO, factor: string): Record<string, unknown> {
  return (site.factors?.[factor]?.provenance as Record<string, unknown>) ?? {}
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && v !== null && v !== '' && v !== undefined ? n : null
}

function scoreColor(n: number | null | undefined): string {
  if (n == null) return avalonPalette.whiteDim
  if (n >= 0.7) return avalonPalette.green
  if (n >= 0.4) return avalonPalette.amber
  return avalonPalette.red
}

// ── Infrastructure assessment functions ─────────────────────────────────────

function tapAssessment(distMi: number): { cost: string; color: string; note: string } {
  if (distMi <= 2)  return { cost: '$2–5M est.',                  color: avalonPalette.green,    note: `Direct tap off existing 230 kV structure. Minimal ROW. Most favorable scenario.` }
  if (distMi <= 5)  return { cost: `$${(distMi*2).toFixed(0)}–${(distMi*4).toFixed(0)}M est.`,   color: avalonPalette.green,    note: `${distMi.toFixed(1)} mi spur. Standard ROW acquisition ~6–12 months.` }
  if (distMi <= 10) return { cost: `$${(distMi*2.5).toFixed(0)}–${(distMi*4.5).toFixed(0)}M est.`, color: avalonPalette.amber,    note: `${distMi.toFixed(1)} mi tap. Moderate ROW; may require new switching station.` }
  if (distMi <= 18) return { cost: `$${(distMi*3).toFixed(0)}–${(distMi*6).toFixed(0)}M est.`,   color: '#fb923c',              note: `${distMi.toFixed(1)} mi. New dedicated substation likely required (+$15–30M). 18–30 mo timeline.` }
  return               { cost: `>$${(distMi*4).toFixed(0)}M est.`,               color: avalonPalette.red,      note: `${distMi.toFixed(1)} mi — challenging. New substation + extended ROW acquisition needed.` }
}

function substationNote(subDistMi: number, subVoltKv: number | null): string {
  if (subDistMi < 4)
    return `Existing ${subVoltKv ? subVoltKv.toFixed(0) + ' kV' : ''} substation ${subDistMi.toFixed(1)} mi away. Upgrade tap likely sufficient; full greenfield sub not needed.`
  if (subDistMi < 12)
    return `Substation ${subDistMi.toFixed(1)} mi away. New switching station or transformer bank near site may be more cost-effective than extending to existing sub.`
  return `Substation ${subDistMi.toFixed(1)} mi away. Recommend new dedicated 230/34.5 kV substation on or adjacent to the parcel. Add $15–40M and 18–30 months to schedule.`
}

function gasTurbineNote(distMi: number): { label: string; color: string } {
  if (distMi <= 5)  return { label: 'Excellent — direct tap viable',           color: avalonPalette.green }
  if (distMi <= 15) return { label: 'Good — spur line cost-effective',          color: avalonPalette.green }
  if (distMi <= 30) return { label: 'Marginal — evaluate vs. grid alternatives', color: avalonPalette.amber }
  return                   { label: 'Not viable for on-site gas generation',    color: avalonPalette.red   }
}

function solarPotential(lat: number): { label: string; detail: string; color: string } {
  if (lat < 32) return { label: 'High',     color: avalonPalette.green,   detail: 'High DNI (>5.5 kWh/m²/day). Utility-scale PPA or on-site solar commercially attractive.' }
  if (lat < 36) return { label: 'Good',     color: avalonPalette.green,   detail: 'Moderate-high irradiance. Solar PPA or on-site co-generation both viable.' }
  if (lat < 40) return { label: 'Moderate', color: avalonPalette.amber,   detail: 'Moderate irradiance. Solar viable with strong long-term PPA contract.' }
  return               { label: 'Limited',  color: avalonPalette.whiteDim, detail: 'Lower irradiance. Solar supplemental; gas or nuclear PPA preferred for firm AI load.' }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 0.6 }}>
      <span style={{ ...S_KEY }}>{label}</span>
      <span style={{ ...S_VAL, color: color ?? '#d7e2ff' }}>{value}</span>
    </Box>
  )
}

function IntelSection({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={S_SECTION_HEAD}>{head}</Typography>
      {children}
    </Box>
  )
}

function CalloutBox({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 1.5, p: 1.25, bgcolor: avalonPalette.bgInput, border: `1px solid ${avalonPalette.border}`, borderRadius: 0.5 }}>
      <Typography sx={S_SUB_HEAD}>{head}</Typography>
      {children}
    </Box>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface SiteIntelPanelProps {
  site: SiteResultDTO
  onExit: () => void
  onOpenDetail: () => void
}

export default function SiteIntelPanel({ site, onExit, onOpenDetail }: SiteIntelPanelProps) {
  const pt  = useMemo(() => prov(site, 'power_transmission'), [site])
  const gp  = useMemo(() => prov(site, 'gas_pipeline'),      [site])
  const fb  = useMemo(() => prov(site, 'fiber'),             [site])

  const txDistMi    = num(pt.nearest_distance_mi)
  const subDistMi   = num(pt.nearest_substation_mi)
  const subVoltKv   = num(pt.substation_max_volt_kv)
  const subHeadroom = num(pt.substation_headroom_proxy)
  const gasDistMi   = num(gp.nearest_distance_mi)

  const killed = Object.values(site.kill_flags ?? {}).some(Boolean)
  const tap    = txDistMi   != null ? tapAssessment(txDistMi) : null
  const gas    = gasDistMi  != null ? gasTurbineNote(gasDistMi) : null
  const solar  = solarPotential(site.lat)

  // Fiber fields vary by ingest source — probe common key names
  const fiberPopKm = num(fb.nearest_pop_km ?? fb.nearest_distance_mi != null ? (fb.nearest_distance_mi as number) * 1.609 : null)
  const fiberIxpKm = num(fb.nearest_ixp_km)

  return (
    <Box sx={{
      height: '100%',
      bgcolor: avalonPalette.bgPanel,
      borderLeft: `1px solid ${avalonPalette.border}`,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        p: '14px 16px 12px',
        borderBottom: `1px solid ${avalonPalette.border}`,
        bgcolor: '#060810',
        flexShrink: 0,
        background: 'linear-gradient(180deg, #060a18 0%, #090b12 100%)',
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 10, letterSpacing: '0.24em', color: avalonPalette.amber, textTransform: 'uppercase' }}>
            ◆ SITE INTELLIGENCE · 3D VIEW
          </Typography>
          <button
            onClick={onExit}
            style={{
              background: 'none', border: `1px solid ${avalonPalette.border}`,
              color: avalonPalette.whiteDim, fontFamily: '"VT323", monospace',
              fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer',
              padding: '2px 8px', borderRadius: 3,
            }}
          >
            EXIT 3D ✕
          </button>
        </Box>
        <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 22, letterSpacing: '0.06em', color: '#e6efff', lineHeight: 1.1, mt: 0.5 }}>
          {site.site_id}
        </Typography>
        <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, mt: 0.25 }}>
          {site.lat.toFixed(5)}°N · {Math.abs(site.lon).toFixed(5)}°W
        </Typography>

        <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{
            fontFamily: '"VT323", monospace', fontSize: 30, lineHeight: 1,
            color: killed ? avalonPalette.red : avalonPalette.cyan,
            textShadow: killed ? `0 0 12px ${avalonPalette.red}66` : `0 0 12px ${avalonPalette.cyan}55`,
          }}>
            {killed ? 'KILLED' : site.composite.toFixed(2)}
          </Typography>
          {!killed && (
            <Box sx={{ flex: 1, height: 5, bgcolor: avalonPalette.bgInput, borderRadius: 0.5, overflow: 'hidden' }}>
              <Box sx={{
                height: '100%',
                width: `${(site.composite / 10) * 100}%`,
                bgcolor: site.composite > 7 ? avalonPalette.green : site.composite > 4 ? avalonPalette.amber : avalonPalette.red,
                transition: 'width 0.5s ease',
              }} />
            </Box>
          )}
        </Box>
        {killed && (
          <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.red, mt: 0.5 }}>
            Kill flags: {Object.entries(site.kill_flags ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ')}
          </Typography>
        )}
      </Box>

      {/* ── Intelligence body ───────────────────────────────────────────────── */}
      <Box sx={{ p: '14px 16px', flex: 1, overflowY: 'auto' }}>

        {/* Power Grid */}
        <IntelSection head="⚡  POWER GRID ACCESS">
          {txDistMi != null ? (
            <>
              <Row
                label="230 kV line"
                value={`${txDistMi.toFixed(1)} mi`}
                color={txDistMi < 5 ? avalonPalette.green : txDistMi < 15 ? avalonPalette.amber : avalonPalette.red}
              />
              {subDistMi != null && <Row label="Nearest substation" value={`${subDistMi.toFixed(1)} mi`} />}
              {subVoltKv  != null && <Row label="Substation voltage" value={`${subVoltKv.toFixed(0)} kV`} />}
              {subHeadroom != null && (
                <Row
                  label="Headroom proxy"
                  value={`${(subHeadroom * 100).toFixed(0)}%`}
                  color={scoreColor(subHeadroom)}
                />
              )}
            </>
          ) : (
            <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, fontStyle: 'italic' }}>
              Transmission data unavailable — factor may be imputed.
            </Typography>
          )}

          {tap && (
            <CalloutBox head="Tap Line Assessment">
              <Row label="Est. cost" value={tap.cost} color={tap.color} />
              <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, mt: 0.5, lineHeight: 1.5 }}>
                {tap.note}
              </Typography>
            </CalloutBox>
          )}

          {subDistMi != null && (
            <CalloutBox head="New Substation">
              <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, lineHeight: 1.5 }}>
                {substationNote(subDistMi, subVoltKv)}
              </Typography>
            </CalloutBox>
          )}
        </IntelSection>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        {/* On-Site Generation */}
        <IntelSection head="🔥  ON-SITE GENERATION">
          {gasDistMi != null ? (
            <>
              <Row label="Gas pipeline" value={`${gasDistMi.toFixed(1)} mi`} />
              <Row label="Turbine feasibility" value={gas!.label} color={gas!.color} />
            </>
          ) : (
            <Row label="Gas pipeline" value="—" />
          )}
          <Row label="Solar potential" value={solar.label} color={solar.color} />
          <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, mt: 0.75, lineHeight: 1.5 }}>
            {solar.detail}
          </Typography>
          <CalloutBox head="Private Power Strategy">
            <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim, lineHeight: 1.5 }}>
              {gasDistMi != null && gasDistMi <= 15
                ? `Gas pipeline ${gasDistMi.toFixed(1)} mi away makes a private microgrid viable. Combined with solar+BESS, this site could operate off-grid — bypassing interconnection queues entirely.`
                : `Grid connection remains primary path. Solar PPA + BESS can reduce grid dependency and improve power cost score over time.`
              }
            </Typography>
          </CalloutBox>
        </IntelSection>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        {/* Fiber */}
        <IntelSection head="📡  FIBER & LATENCY">
          {fiberPopKm != null && <Row label="Nearest POP" value={`${fiberPopKm.toFixed(0)} km`} />}
          {fiberIxpKm != null && <Row label="Nearest IXP" value={`${fiberIxpKm.toFixed(0)} km`} />}
          <Row
            label="Fiber score"
            value={site.factors?.fiber?.normalized?.toFixed(2) ?? '—'}
            color={scoreColor(site.factors?.fiber?.normalized)}
          />
          <Row
            label="Latency score"
            value={site.factors?.latency?.normalized?.toFixed(2) ?? '—'}
            color={scoreColor(site.factors?.latency?.normalized)}
          />
        </IntelSection>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        {/* Water + Climate + Hazard */}
        <IntelSection head="💧  WATER · CLIMATE · HAZARD">
          <Row label="Water"   value={site.factors?.water?.normalized?.toFixed(2)   ?? '—'} color={scoreColor(site.factors?.water?.normalized)} />
          <Row label="Climate" value={site.factors?.climate?.normalized?.toFixed(2) ?? '—'} color={scoreColor(site.factors?.climate?.normalized)} />
          <Row label="Hazard"  value={site.factors?.hazard?.normalized?.toFixed(2)  ?? '—'} color={scoreColor(site.factors?.hazard?.normalized)} />
        </IntelSection>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        {/* Land + Community */}
        <IntelSection head="🗺  LAND · PERMITTING · COMMUNITY">
          <Row label="Land / zoning"  value={site.factors?.land_zoning?.normalized?.toFixed(2)   ?? '—'} color={scoreColor(site.factors?.land_zoning?.normalized)} />
          <Row label="Permitting"     value={site.factors?.permitting?.normalized?.toFixed(2)     ?? '—'} color={scoreColor(site.factors?.permitting?.normalized)} />
          <Row label="Tax incentives" value={site.factors?.tax_incentives?.normalized?.toFixed(2) ?? '—'} color={scoreColor(site.factors?.tax_incentives?.normalized)} />
          <Row label="Labor"          value={site.factors?.labor?.normalized?.toFixed(2)          ?? '—'} color={scoreColor(site.factors?.labor?.normalized)} />
          <Row label="Community"      value={site.factors?.community?.normalized?.toFixed(2)      ?? '—'} color={scoreColor(site.factors?.community?.normalized)} />
        </IntelSection>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        {/* 3D Buildings Legend */}
        <IntelSection head="🏗  3D BUILDINGS LEGEND">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
            {Object.entries(DEEP_DIVE_BUILDING_PALETTE).map(([, { color, label }]) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 11, height: 11, bgcolor: color, borderRadius: '2px', flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.22)',
                }} />
                <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: '#d7e2ff' }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 8.5, color: avalonPalette.whiteDim, mt: 1, lineHeight: 1.5 }}>
            Land use visible at zoom ≥ 13. Industrial (orange) indicates existing compatible use.
            Residential (slate) signals permitting friction. Rotate map with right-click to explore.
          </Typography>
        </IntelSection>

      </Box>

      {/* ── Footer actions ───────────────────────────────────────────────────── */}
      <Box sx={{
        p: '12px 16px',
        borderTop: `1px solid ${avalonPalette.border}`,
        bgcolor: '#060810',
        flexShrink: 0,
        display: 'flex',
        gap: 1,
      }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={onOpenDetail}
          sx={{
            fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.1em',
            color: avalonPalette.cyan, borderColor: avalonPalette.cyanDim,
            '&:hover': { borderColor: avalonPalette.cyan, bgcolor: `${avalonPalette.cyan}14` },
          }}
        >
          14 FACTORS
        </Button>
        <Button
          fullWidth
          variant="contained"
          onClick={onExit}
          sx={{
            fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.1em',
            bgcolor: avalonPalette.amber, color: avalonPalette.bg,
            '&:hover': { bgcolor: avalonPalette.amberDim },
          }}
        >
          EXIT 3D
        </Button>
      </Box>
    </Box>
  )
}
