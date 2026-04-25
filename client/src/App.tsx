import { ThemeProvider, CssBaseline, AppBar, Toolbar, Typography, Box, Link } from '@mui/material'
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
            'radial-gradient(circle at 8% 12%, rgba(0,229,255,0.06) 0%, rgba(0,229,255,0) 30%), radial-gradient(circle at 88% 0%, rgba(255,149,0,0.10) 0%, rgba(255,149,0,0) 34%), linear-gradient(180deg, #09090b 0%, #101014 100%)',
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
              QUANTITATIVE DATA CENTER SITING
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
        <Box sx={{ position: 'absolute', inset: '56px 0 0 0' }}>
          <SitingPanel />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
