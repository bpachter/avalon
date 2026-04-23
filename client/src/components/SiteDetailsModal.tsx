import { Drawer, Box, Typography, Button, Divider, Chip, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { SiteResultDTO, FactorResultDTO } from '../api'
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

export default function SiteDetailsModal({ site, open, onClose }: SiteDetailsModalProps) {
  if (!site) return null

  const killed = Object.values(site.kill_flags ?? {}).some(Boolean)
  const killReasons = Object.entries(site.kill_flags ?? {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: '420px',
            bgcolor: avalonPalette.bgPanel,
            borderLeft: `1px solid ${avalonPalette.border}`,
            overflowY: 'auto',
          },
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography
            variant="h6"
            sx={{ fontFamily: '"VT323", monospace', fontSize: 18, letterSpacing: '0.1em' }}
          >
            SITE DETAILS
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: avalonPalette.whiteDim }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        <Box sx={{ mb: 3 }}>
          <Typography
            sx={{
              fontFamily: '"VT323", monospace',
              fontSize: 14,
              letterSpacing: '0.08em',
              color: avalonPalette.whiteDim,
              mb: 0.5,
            }}
          >
            ID
          </Typography>
          <Typography sx={{ fontFamily: '"VT323", monospace', fontSize: 16, mb: 1 }}>
            {site.site_id}
          </Typography>

          <Typography
            sx={{
              fontFamily: '"VT323", monospace',
              fontSize: 12,
              letterSpacing: '0.08em',
              color: avalonPalette.whiteDim,
            }}
          >
            {site.lat.toFixed(6)}° N, {Math.abs(site.lon).toFixed(6)}° W
          </Typography>
        </Box>

        <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography
              sx={{
                fontFamily: '"VT323", monospace',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: avalonPalette.whiteDim,
              }}
            >
              Composite Score
            </Typography>
            <Typography
              sx={{
                fontFamily: '"VT323", monospace',
                fontSize: 20,
                fontWeight: 'bold',
                color: killed ? avalonPalette.red : avalonPalette.cyan,
              }}
            >
              {killed ? 'KILLED' : site.composite.toFixed(2)}
            </Typography>
          </Box>
          {!killed && (
            <Box
              sx={{
                height: 6,
                bgcolor: avalonPalette.bgInput,
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${Math.min(100, (site.composite / 10) * 100)}%`,
                  bgcolor: site.composite > 7 ? avalonPalette.green : site.composite > 4 ? avalonPalette.amber : avalonPalette.red,
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
          )}
        </Box>

        {killReasons.length > 0 && (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontFamily: '"VT323", monospace',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: avalonPalette.red,
                  mb: 1,
                }}
              >
                Kill Flags
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {killReasons.map((reason) => (
                  <Chip
                    key={reason}
                    label={reason}
                    size="small"
                    sx={{
                      fontFamily: '"VT323", monospace',
                      fontSize: 10,
                      height: 24,
                      bgcolor: avalonPalette.red,
                      color: avalonPalette.bg,
                    }}
                  />
                ))}
              </Box>
            </Box>
            <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
          </>
        )}

        {site.imputed?.length > 0 && (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontFamily: '"VT323", monospace',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: avalonPalette.amberDim,
                  mb: 1,
                }}
              >
                Imputed Data
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {site.imputed.map((field) => (
                  <Chip
                    key={field}
                    label={field}
                    size="small"
                    sx={{
                      fontFamily: '"VT323", monospace',
                      fontSize: 10,
                      height: 24,
                      bgcolor: avalonPalette.bgInput,
                      color: avalonPalette.amber,
                      borderColor: avalonPalette.amberDim,
                      border: `1px solid`,
                    }}
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
            <Divider sx={{ mb: 2, borderColor: avalonPalette.border }} />
          </>
        )}

        <Box>
          <Typography
            sx={{
              fontFamily: '"VT323", monospace',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: avalonPalette.whiteDim,
              mb: 1.5,
            }}
          >
            14-Factor Breakdown
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Object.entries(site.factors ?? {})
              .sort(([, a], [, b]) => (b.weighted ?? 0) - (a.weighted ?? 0))
              .map(([factorName, factor]) => (
                <Box
                  key={factorName}
                  sx={{
                    p: 1.25,
                    bgcolor: avalonPalette.bgInput,
                    border: `1px solid ${avalonPalette.border}`,
                    borderRadius: 0.5,
                    opacity: factor.killed ? 0.4 : 1,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.75 }}>
                    <Box>
                      <Typography
                        sx={{
                          fontFamily: '"VT323", monospace',
                          fontSize: 11,
                          letterSpacing: '0.08em',
                          color: factorColor(factor),
                          textTransform: 'uppercase',
                        }}
                      >
                        {factorName}
                      </Typography>
                      {factor.stub && (
                        <Chip
                          label="STUB"
                          size="small"
                          sx={{
                            fontFamily: '"VT323", monospace',
                            fontSize: 9,
                            height: 18,
                            mt: 0.5,
                            bgcolor: avalonPalette.bgPanel,
                            color: avalonPalette.whiteDim,
                            border: `1px solid ${avalonPalette.border}`,
                          }}
                          variant="outlined"
                        />
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: '"VT323", monospace',
                        fontSize: 12,
                        fontWeight: 'bold',
                        color: factorColor(factor),
                        minWidth: '48px',
                        textAlign: 'right',
                      }}
                    >
                      {factor.killed ? '✗' : factor.normalized.toFixed(2)}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      height: 6,
                      bgcolor: avalonPalette.bg,
                      borderRadius: 0.5,
                      overflow: 'hidden',
                      mb: 0.75,
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${Math.min(100, factor.normalized * 100)}%`,
                        bgcolor: factorColor(factor),
                      }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: 10 }}>
                    <Typography
                      sx={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: 9,
                        color: avalonPalette.whiteDim,
                      }}
                    >
                      raw: {factor.raw_value != null ? factor.raw_value.toFixed(3) : 'null'}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: 9,
                        color: avalonPalette.whiteDim,
                      }}
                    >
                      weight: {(factor.weight ?? 0).toFixed(3)}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: 9,
                        color: avalonPalette.whiteDim,
                      }}
                    >
                      normalized: {factor.normalized.toFixed(3)}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: 9,
                        color: avalonPalette.amber,
                      }}
                    >
                      weighted: {(factor.weighted ?? 0).toFixed(3)}
                    </Typography>
                  </Box>
                </Box>
              ))}
          </Box>
        </Box>

        <Divider sx={{ my: 2, borderColor: avalonPalette.border }} />

        <Button
          variant="contained"
          fullWidth
          onClick={onClose}
          sx={{
            bgcolor: avalonPalette.cyan,
            color: avalonPalette.bg,
            fontFamily: '"VT323", monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            '&:hover': { bgcolor: avalonPalette.cyanDim },
          }}
        >
          Close
        </Button>
      </Box>
    </Drawer>
  )
}
