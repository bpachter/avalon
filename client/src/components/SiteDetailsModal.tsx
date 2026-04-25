import { useState, useCallback } from 'react'
import { Drawer, Box, Typography, Button, Divider, Chip, IconButton, CircularProgress } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import type { SiteResultDTO, FactorResultDTO } from '../api'
import { requestAiAnalysis } from '../api'
import { avalonPalette } from '../theme'

interface SiteDetailsModalProps {
  site: SiteResultDTO | null
  open: boolean
  onClose: () => void
}

function factorColor(factor: FactorResultDTO): string {
  if (factor.killed) return avalonPalette.red
  if (factor.stub) return avalonPalette.whiteDim
  const n = factor.normalized ?? 0
  const t = Math.max(0, Math.min(1, n))
  if (t < 0.5) {
    const k = t / 0.5
    const r = Math.round(255)
    const g = Math.round(26 + (149 - 26) * k)
    const b = Math.round(64 - 64 * k)
    return `rgb(${r},${g},${b})`
  } else {
    const k = (t - 0.5) / 0.5
    const r = Math.round(255 - (255 - 57) * k)
    const g = Math.round(149 + (211 - 149) * k)
    const b = Math.round(0 + 83 * k)
    return `rgb(${r},${g},${b})`
  }
}

function FactorsPanel({ site }: { site: SiteResultDTO }) {
  const killReasons = Object.entries(site.kill_flags ?? {}).filter(([, v]) => v).map(([k]) => k)
  return (
    <>
      {killReasons.length > 0 && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: avalonPalette.red, mb: 1 }}>Kill Flags</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {killReasons.map((r) => <Chip key={r} label={r} size="small" sx={{ fontFamily: '"VT323", monospace', fontSize: 10, height: 24, bgcolor: avalonPalette.red, color: avalonPalette.bg }} />)}
            </Box>
          </Box>
          <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
        </>
      )}
      {(site.imputed?.length ?? 0) > 0 && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: avalonPalette.amberDim, mb: 1 }}>Imputed Data</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {site.imputed.map((f) => <Chip key={f} label={f} size="small" variant="outlined" sx={{ fontFamily: '"VT323", monospace', fontSize: 10, height: 24, bgcolor: avalonPalette.bgInput, color: avalonPalette.amber, border: `1px solid ${avalonPalette.amberDim}` }} />)}
            </Box>
          </Box>
          <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
        </>
      )}
      <Box>
        <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: avalonPalette.whiteDim, mb: 1.5 }}>14-Factor Breakdown</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {Object.entries(site.factors ?? {})
            .sort(([, a], [, b]) => (b.weighted ?? 0) - (a.weighted ?? 0))
            .map(([factorName, factor]) => (
              <Box key={factorName} sx={{ p: 1.25, bgcolor: avalonPalette.bgInput, border: `1px solid ${avalonPalette.border}`, borderRadius: 0.5, opacity: factor.killed ? 0.4 : 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.75 }}>
                  <Box>
                    <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.08em', color: factorColor(factor), textTransform: 'uppercase' }}>{factorName}</Typography>
                    {factor.stub && <Chip label="STUB" size="small" variant="outlined" sx={{ fontFamily: '"VT323", monospace', fontSize: 9, height: 18, mt: 0.5, bgcolor: avalonPalette.bgPanel, color: avalonPalette.whiteDim, border: `1px solid ${avalonPalette.border}` }} />}
                  </Box>
                  <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, fontWeight: 'bold', color: factorColor(factor), minWidth: '48px', textAlign: 'right' }}>
                    {factor.killed ? 'x' : factor.normalized.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ height: 6, bgcolor: avalonPalette.bg, borderRadius: 0.5, overflow: 'hidden', mb: 0.75 }}>
                  <Box sx={{ height: '100%', width: `${Math.min(100, factor.normalized * 100)}%`, bgcolor: factorColor(factor) }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {([['raw', factor.raw_value != null ? factor.raw_value.toFixed(3) : 'null'], ['weight', (factor.weight ?? 0).toFixed(3)], ['normalized', factor.normalized.toFixed(3)]] as [string, string][]).map(([lbl, val]) => (
                    <Typography key={lbl} sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim }}>{lbl}: {val}</Typography>
                  ))}
                  <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.amber }}>weighted: {(factor.weighted ?? 0).toFixed(3)}</Typography>
                </Box>
              </Box>
            ))}
        </Box>
      </Box>
    </>
  )
}

function AiPanel({ site }: { site: SiteResultDTO }) {
  const [narratives, setNarratives] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await requestAiAnalysis({
      site_id: site.site_id,
      lat: site.lat,
      lon: site.lon,
      state: (site.extras?.state as string | undefined) ?? '',
      composite: site.composite,
      factors: Object.fromEntries(Object.entries(site.factors ?? {}).map(([k, v]) => [k, { ...v }])),
    })
    setLoading(false)
    if ('error' in result) { setError(result.error) } else { setNarratives(result.narratives) }
  }, [site])

  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <CircularProgress size={32} sx={{ color: avalonPalette.cyan, mb: 2 }} />
        <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, color: avalonPalette.whiteDim }}>
          Analyzing {Object.keys(site.factors ?? {}).length} factors with Mithrandir...
        </Typography>
      </Box>
    )
  }

  if (!narratives) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, color: avalonPalette.whiteDim, mb: 2, letterSpacing: '0.06em', lineHeight: 1.7 }}>
          Mithrandir (Gemma4 26B on local GPU) will analyze each scoring factor
          and generate a site assessment narrative. Requires OLLAMA_URL on the server.
        </Typography>
        {error && <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 10, color: avalonPalette.red, mb: 2 }}>{error}</Typography>}
        <Button variant="contained" onClick={generate} startIcon={<AutoAwesomeIcon />}
          sx={{ bgcolor: avalonPalette.amber, color: avalonPalette.bg, fontFamily: '"VT323", monospace', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', '&:hover': { bgcolor: avalonPalette.amberDim } }}>
          Generate AI Analysis
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {narratives.overall_summary && (
        <Box sx={{ p: 1.5, bgcolor: `${avalonPalette.cyan}18`, border: `1px solid ${avalonPalette.cyan}55`, borderRadius: 1 }}>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.08em', color: avalonPalette.cyan, mb: 1, textTransform: 'uppercase' }}>Executive Summary</Typography>
          <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9.5, color: '#e8eaf6', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{narratives.overall_summary}</Typography>
        </Box>
      )}
      {Object.entries(narratives).filter(([k]) => k !== 'overall_summary')
        .sort(([a], [b]) => (site.factors?.[b]?.weighted ?? 0) - (site.factors?.[a]?.weighted ?? 0))
        .map(([factorName, narrative]) => {
          const factor = site.factors?.[factorName]
          const color = factor ? factorColor(factor) : avalonPalette.whiteDim
          const isPlaceholder = narrative.startsWith('[')
          return (
            <Box key={factorName} sx={{ p: 1.25, bgcolor: avalonPalette.bgInput, border: `1px solid ${avalonPalette.border}`, borderRadius: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.08em', color, textTransform: 'uppercase' }}>{factorName.replace(/_/g, ' ')}</Typography>
                {factor?.normalized != null && <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9, color: avalonPalette.whiteDim }}>[{factor.normalized.toFixed(2)}]</Typography>}
              </Box>
              <Typography sx={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9.5, color: isPlaceholder ? avalonPalette.whiteDim : '#e8eaf6', fontStyle: isPlaceholder ? 'italic' : 'normal', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{narrative}</Typography>
            </Box>
          )
        })}
      <Button size="small" onClick={() => setNarratives(null)} startIcon={<AutoAwesomeIcon />}
        sx={{ color: avalonPalette.amber, fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', alignSelf: 'flex-start' }}>
        Regenerate
      </Button>
    </Box>
  )
}

export default function SiteDetailsModal({ site, open, onClose }: SiteDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'factors' | 'ai'>('factors')
  if (!site) return null
  const killed = Object.values(site.kill_flags ?? {}).some(Boolean)
  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: '420px', bgcolor: avalonPalette.bgPanel, borderLeft: `1px solid ${avalonPalette.border}`, overflowY: 'auto' } } }}>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontFamily: '"VT323", monospace', fontSize: 18, letterSpacing: '0.1em' }}>SITE DETAILS</Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: avalonPalette.whiteDim }}><CloseIcon /></IconButton>
        </Box>
        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 14, color: avalonPalette.whiteDim, mb: 0.5, letterSpacing: '0.08em' }}>ID</Typography>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 16, mb: 1 }}>{site.site_id}</Typography>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, color: avalonPalette.whiteDim, letterSpacing: '0.08em' }}>
            {site.lat.toFixed(6)}N, {Math.abs(site.lon).toFixed(6)}W
          </Typography>
        </Box>
        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: avalonPalette.whiteDim }}>Composite Score</Typography>
            <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 20, fontWeight: 'bold', color: killed ? avalonPalette.red : avalonPalette.cyan }}>{killed ? 'KILLED' : site.composite.toFixed(2)}</Typography>
          </Box>
          {!killed && (
            <Box sx={{ height: 6, bgcolor: avalonPalette.bgInput, borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.min(100, (site.composite / 10) * 100)}%`, bgcolor: site.composite > 7 ? avalonPalette.green : site.composite > 4 ? avalonPalette.amber : avalonPalette.red, transition: 'width 0.3s ease' }} />
            </Box>
          )}
        </Box>
        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
          {(['factors', 'ai'] as const).map((tab) => (
            <Button key={tab} size="small" onClick={() => setActiveTab(tab)}
              sx={{ flex: 1, fontFamily: '"VT323", monospace', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', py: 0.5, bgcolor: activeTab === tab ? avalonPalette.bgInput : 'transparent', color: activeTab === tab ? avalonPalette.cyan : avalonPalette.whiteDim, border: `1px solid ${activeTab === tab ? avalonPalette.cyan : avalonPalette.border}`, borderRadius: 0.5, '&:hover': { bgcolor: avalonPalette.bgInput } }}>
              {tab === 'factors' ? '14-FACTORS' : 'AI ANALYSIS'}
            </Button>
          ))}
        </Box>
        {activeTab === 'factors' && <FactorsPanel site={site} />}
        {activeTab === 'ai' && <AiPanel site={site} />}
        <Divider sx={{ my: 2, borderColor: avalonPalette.border }} />
        <Button variant="contained" fullWidth onClick={onClose}
          sx={{ bgcolor: avalonPalette.cyan, color: avalonPalette.bg, fontFamily: '"VT323", monospace', textTransform: 'uppercase', letterSpacing: '0.1em', '&:hover': { bgcolor: avalonPalette.cyanDim } }}>
          Close
        </Button>
      </Box>
    </Drawer>
  )
}