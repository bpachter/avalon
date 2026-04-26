import { useMemo } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { avalonPalette } from '../theme'
import type { SiteResultDTO } from '../api'

// Rotating palette for the up-to-4 site overlays. Picked to remain
// distinguishable on the dark Signal Intelligence background while
// staying within the existing palette's voice.
const COMPARE_COLORS = [
  '#0ea5e9', // signal cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#818cf8', // violet
]

type Props = {
  open: boolean
  onClose: () => void
  sites: SiteResultDTO[]
}

// Build the union of factor keys across all sites in a stable order
// (sorted alphabetically so the radar shape doesn't reshuffle when the
// user adds/removes a site mid-comparison).
function unionFactors(sites: SiteResultDTO[]): string[] {
  const all = new Set<string>()
  for (const s of sites) {
    for (const k of Object.keys(s.factors ?? {})) all.add(k)
  }
  return Array.from(all).sort()
}

// SVG radar chart. Each polygon represents one site; vertices are placed
// at angle = (i / N) * 2π with radius = normalized factor score (0..1).
// Killed factors are clamped to 0 so they visibly notch inward.
function RadarChart({ sites, factors }: { sites: SiteResultDTO[]; factors: string[] }) {
  const SIZE = 460
  const PAD = 90 // room for labels around the perimeter
  const cx = SIZE / 2
  const cy = SIZE / 2
  const radius = (SIZE - PAD * 2) / 2
  const N = factors.length

  if (N < 3) {
    return (
      <Typography sx={{ color: avalonPalette.whiteDim, fontSize: 12, p: 4, textAlign: 'center' }}>
        Need at least 3 factors to render a radar chart.
      </Typography>
    )
  }

  const angleFor = (i: number) => -Math.PI / 2 + (i / N) * 2 * Math.PI
  const pointAt = (i: number, r: number) => {
    const a = angleFor(i)
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const
  }

  // Concentric grid rings at 0.25 / 0.5 / 0.75 / 1.0
  const rings = [0.25, 0.5, 0.75, 1].map((t) => {
    const pts = factors.map((_, i) => pointAt(i, radius * t).join(',')).join(' ')
    return { t, pts }
  })

  // Spokes
  const spokes = factors.map((_, i) => {
    const [x, y] = pointAt(i, radius)
    return { x1: cx, y1: cy, x2: x, y2: y }
  })

  // Polygons per site
  const polys = sites.map((s, sIdx) => {
    const color = COMPARE_COLORS[sIdx % COMPARE_COLORS.length]
    const pts = factors.map((k, i) => {
      const f = s.factors?.[k]
      const norm = f && !f.killed && Number.isFinite(f.normalized) ? Math.max(0, Math.min(1, f.normalized)) : 0
      return pointAt(i, radius * norm).join(',')
    }).join(' ')
    return { color, pts, site_id: s.site_id }
  })

  // Labels at perimeter
  const labels = factors.map((k, i) => {
    const [x, y] = pointAt(i, radius + 18)
    const a = angleFor(i)
    let anchor: 'start' | 'middle' | 'end' = 'middle'
    const cosA = Math.cos(a)
    if (cosA > 0.25) anchor = 'start'
    else if (cosA < -0.25) anchor = 'end'
    return { x, y, anchor, label: k.replace(/_/g, ' ') }
  })

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: SIZE, display: 'block', margin: '0 auto' }}>
      {/* Rings */}
      {rings.map((r) => (
        <polygon
          key={r.t}
          points={r.pts}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={1}
        />
      ))}
      {/* Outer ring labels */}
      {[0.5, 1].map((t) => (
        <text
          key={t}
          x={cx + 4}
          y={cy - radius * t - 2}
          fontSize={9}
          fontFamily='"JetBrains Mono", monospace'
          fill="rgba(148,163,184,0.55)"
        >
          {(t * 100).toFixed(0)}
        </text>
      ))}
      {/* Spokes */}
      {spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="rgba(148,163,184,0.12)" strokeWidth={1} />
      ))}
      {/* Site polygons */}
      {polys.map((p, i) => (
        <g key={p.site_id}>
          <polygon
            points={p.pts}
            fill={p.color}
            fillOpacity={0.18}
            stroke={p.color}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${p.color}55)` }}
          />
          {/* Vertex dots */}
          {factors.map((k, fi) => {
            const f = sites[i].factors?.[k]
            const norm = f && !f.killed && Number.isFinite(f.normalized) ? Math.max(0, Math.min(1, f.normalized)) : 0
            const [x, y] = pointAt(fi, radius * norm)
            return <circle key={k} cx={x} cy={y} r={2.5} fill={p.color} />
          })}
        </g>
      ))}
      {/* Factor labels */}
      {labels.map((l) => (
        <text
          key={l.label}
          x={l.x}
          y={l.y}
          fontSize={10}
          fontFamily='"Space Grotesk", sans-serif'
          fontWeight={600}
          fill="#cbd5e1"
          textAnchor={l.anchor}
          dominantBaseline="middle"
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {l.label}
        </text>
      ))}
    </svg>
  )
}

export default function SiteCompareModal({ open, onClose, sites }: Props) {
  const factors = useMemo(() => unionFactors(sites), [sites])

  // Pre-compute a small per-site stat strip: composite, top-3 factor names.
  const summaries = useMemo(() => {
    return sites.map((s) => {
      const top = Object.entries(s.factors ?? {})
        .filter(([, f]) => !f.killed && !f.stub)
        .sort(([, a], [, b]) => (b.weighted ?? 0) - (a.weighted ?? 0))
        .slice(0, 3)
        .map(([k]) => k.replace(/_/g, ' '))
      const killed = Object.values(s.kill_flags).some(Boolean)
      return { site_id: s.site_id, composite: s.composite, killed, top }
    })
  }, [sites])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: avalonPalette.bgPanel,
            color: avalonPalette.textPrimary,
            border: `1px solid ${avalonPalette.border}`,
            borderRadius: '14px',
            backgroundImage: `linear-gradient(135deg, rgba(14,165,233,0.04), rgba(129,140,248,0.04))`,
          },
        },
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: avalonPalette.textBright,
        borderBottom: `1px solid ${avalonPalette.border}`,
      }}>
        <Box sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${avalonPalette.signal}, ${avalonPalette.indigo})`,
          boxShadow: `0 0 8px ${avalonPalette.signal}`,
        }} />
        Site Comparison · {sites.length} sites
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ ml: 'auto', color: avalonPalette.whiteDim, '&:hover': { color: avalonPalette.rose } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {/* Site legend strip */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          {summaries.map((s, i) => {
            const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
            return (
              <Box key={s.site_id} sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: '10px',
                border: `1px solid ${color}55`,
                bgcolor: 'rgba(255,255,255,0.02)',
                minWidth: 160,
              }}>
                <Box sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '2px',
                  bgcolor: color,
                  boxShadow: `0 0 6px ${color}`,
                  flexShrink: 0,
                }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    color: avalonPalette.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.site_id}
                  </Typography>
                  <Typography sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 10,
                    color: s.killed ? avalonPalette.rose : avalonPalette.whiteDim,
                  }}>
                    {s.killed ? 'KILLED' : `composite ${s.composite.toFixed(2)}`}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        {/* Radar chart */}
        <Box sx={{
          bgcolor: 'rgba(5,8,16,0.6)',
          border: `1px solid ${avalonPalette.border}`,
          borderRadius: '12px',
          p: 2,
        }}>
          <RadarChart sites={sites} factors={factors} />
        </Box>

        {/* Per-site top factors */}
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: `repeat(${Math.min(sites.length, 4)}, 1fr)`, gap: 1.5 }}>
          {summaries.map((s, i) => {
            const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
            return (
              <Box key={s.site_id} sx={{
                p: 1.25,
                borderRadius: '8px',
                border: `1px solid ${avalonPalette.border}`,
                borderLeft: `3px solid ${color}`,
                bgcolor: avalonPalette.bgInput,
              }}>
                <Typography sx={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: avalonPalette.whiteDim,
                  mb: 0.5,
                }}>
                  Top drivers
                </Typography>
                {s.top.length === 0 ? (
                  <Typography sx={{ fontSize: 10, color: avalonPalette.whiteDim, fontStyle: 'italic' }}>
                    no real factor data
                  </Typography>
                ) : (
                  s.top.map((t) => (
                    <Typography key={t} sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 10,
                      color: avalonPalette.textPrimary,
                      lineHeight: 1.6,
                    }}>
                      · {t}
                    </Typography>
                  ))
                )}
              </Box>
            )
          })}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
