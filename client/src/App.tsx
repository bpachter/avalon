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
            'radial-gradient(circle at 8% 12%, rgba(14,165,233,0.08) 0%, rgba(14,165,233,0) 34%), radial-gradient(circle at 88% 0%, rgba(129,140,248,0.14) 0%, rgba(129,140,248,0) 38%), linear-gradient(180deg, #050810 0%, #0a1020 100%)',
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
            bgcolor: 'rgba(10, 16, 32, 0.78)',
            borderBottom: `1px solid ${avalonPalette.border}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          <Toolbar variant="dense" sx={{ minHeight: 56, px: { xs: 1.25, sm: 2 }, gap: { xs: 1, sm: 1.5 } }}>
            <Typography
              component="span"
              sx={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: { xs: 20, sm: 25 },
                color: avalonPalette.signal,
                textShadow: '0 0 22px rgba(14,165,233,0.28)',
                letterSpacing: '0.14em',
                lineHeight: 1,
              }}
            >
              AVALON
            </Typography>
            <Typography
              component="span"
              sx={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 500,
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
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: 11,
                color: avalonPalette.whiteDim,
                letterSpacing: '0.1em',
                display: { xs: 'none', sm: 'inline' },
                '&:hover': { color: avalonPalette.signal },
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
