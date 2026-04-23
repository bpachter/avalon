import { ThemeProvider, CssBaseline, AppBar, Toolbar, Typography, Box, Link } from '@mui/material'
import SitingPanel from './components/SitingPanel'
import { avalonTheme, avalonPalette } from './theme'

export default function App() {
  return (
    <ThemeProvider theme={avalonTheme}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', inset: 0, bgcolor: avalonPalette.bg }}>
        <AppBar
          position="absolute"
          elevation={0}
          sx={{
            top: 0, left: 0, right: 0, height: 42,
            bgcolor: '#060810',
            borderBottom: `1px solid ${avalonPalette.border}`,
          }}
        >
          <Toolbar variant="dense" sx={{ minHeight: 42, px: 2, gap: 2 }}>
            <Typography
              component="span"
              sx={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                color: avalonPalette.amber,
                textShadow: `0 0 12px ${avalonPalette.amber}, 0 0 24px ${avalonPalette.amberDim}`,
                letterSpacing: '0.2em',
                lineHeight: 1,
              }}
            >
              AVALON
            </Typography>
            <Typography
              component="span"
              sx={{ fontSize: 11, color: avalonPalette.whiteDim, letterSpacing: '0.1em' }}
            >
              DATACENTER SITING · 14-FACTOR COMPOSITE
            </Typography>
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
        <Box sx={{ position: 'absolute', inset: '42px 0 0 0' }}>
          <SitingPanel />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
