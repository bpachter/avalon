import { ThemeProvider, CssBaseline, AppBar, Toolbar, Typography, Box, Link, Chip } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import HubIcon from '@mui/icons-material/Hub'
import SitingPanel from './components/SitingPanel'
import { avalonTheme, avalonPalette } from './theme'

export default function App() {
  return (
    <ThemeProvider theme={avalonTheme}>
      <CssBaseline />
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          bgcolor: avalonPalette.bg,
          background:
            'radial-gradient(circle at 8% 12%, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0) 32%), radial-gradient(circle at 88% 0%, rgba(255,149,0,0.16) 0%, rgba(255,149,0,0) 36%), linear-gradient(180deg, #05070d 0%, #080b14 100%)',
        }}
      >
        <AppBar
          position="absolute"
          elevation={0}
          sx={{
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            bgcolor: 'rgba(6, 9, 18, 0.72)',
            borderBottom: `1px solid ${avalonPalette.border}`,
            backdropFilter: 'blur(10px)',
          }}
        >
          <Toolbar variant="dense" sx={{ minHeight: 56, px: 2, gap: 1.5 }}>
            <Typography
              component="span"
              sx={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                color: avalonPalette.amber,
                textShadow: `0 0 18px rgba(255,149,0,0.45), 0 0 34px rgba(255,149,0,0.25)`,
                letterSpacing: '0.16em',
                lineHeight: 1,
              }}
            >
              AVALON
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: 11,
                color: avalonPalette.whiteDim,
                letterSpacing: '0.11em',
                display: { xs: 'none', md: 'inline' },
              }}
            >
              GEOSPATIAL SITING · 14 FACTORS · REAL-TIME LAYER INTELLIGENCE
            </Typography>
            <Chip
              size="small"
              icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              label="MUI OVERHAUL"
              sx={{
                ml: 1,
                height: 22,
                borderColor: 'rgba(0,229,255,0.35)',
                color: avalonPalette.cyan,
                display: { xs: 'none', lg: 'inline-flex' },
              }}
              variant="outlined"
            />
            <Chip
              size="small"
              icon={<HubIcon sx={{ fontSize: 14 }} />}
              label="SITING ENGINE LIVE"
              sx={{
                height: 22,
                borderColor: 'rgba(57,211,83,0.35)',
                color: avalonPalette.green,
                display: { xs: 'none', xl: 'inline-flex' },
              }}
              variant="outlined"
            />
            <Link
              href="https://bpachter.github.io"
              underline="none"
              sx={{
                marginLeft: 'auto',
                fontSize: 11,
                color: avalonPalette.whiteDim,
                letterSpacing: '0.1em',
                '&:hover': { color: avalonPalette.cyan },
              }}
            >
              ← PORTFOLIO
            </Link>
          </Toolbar>
        </AppBar>
        <Box sx={{ position: 'absolute', inset: '56px 0 0 0' }}>
          <SitingPanel />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
