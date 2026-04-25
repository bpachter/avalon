import { createTheme, alpha } from '@mui/material/styles'

// Avalon — ENKIDU palette ported into a Material UI theme.
// Goals:
//   - Keep the Blade-Runner / amber-on-near-black vibe of the existing CSS.
//   - Give every MUI component the right defaults so we don't sprinkle `sx`
//     overrides everywhere.
//   - Keep the VT323 / Share Tech Mono mix the rest of the app uses.

const palette = {
  bg:        '#0b0b0d',
  bgPanel:   '#121216',
  bgInput:   '#18181d',
  border:    '#2a2a31',
  borderSoft:'#34343d',
  amber:     '#ff9500',
  amberDim:  '#b36900',
  cyan:      '#00e5ff',
  cyanDim:   '#008a99',
  green:     '#39d353',
  red:       '#ff1a40',
  indigo:    '#5f72ff',
  paperLift: '#1a1a21',
  whiteDim:  '#8899aa',
}

export const avalonTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:   { main: palette.amber, dark: palette.amberDim, contrastText: palette.bg },
    secondary: { main: palette.cyan,  dark: palette.cyanDim,  contrastText: palette.bg },
    success:   { main: palette.green },
    error:     { main: palette.red   },
    warning:   { main: palette.amber },
    background:{ default: palette.bg, paper: palette.bgPanel },
    info:      { main: palette.indigo },
    text:      { primary: '#d7e2ff', secondary: palette.whiteDim, disabled: alpha(palette.whiteDim, 0.4) },
    divider:   palette.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Sora", "Share Tech Mono", monospace',
    fontSize: 13,
    h1: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    h2: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    h3: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    h4: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    h5: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    h6: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.14em', fontWeight: 600 },
    button: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.18em', fontSize: 13, fontWeight: 700 },
    overline: { fontFamily: '"Rajdhani", "VT323", monospace', letterSpacing: '0.2em', fontSize: 11, fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: palette.bg,
          color: '#d7e2ff',
          WebkitFontSmoothing: 'antialiased',
          backgroundImage:
            'radial-gradient(circle at 7% 14%, rgba(0,229,255,0.08) 0%, rgba(0,229,255,0) 32%), radial-gradient(circle at 92% 0%, rgba(255,149,0,0.13) 0%, rgba(255,149,0,0) 40%)',
        },
        // Custom scrollbar matching the ENKIDU look.
        '*::-webkit-scrollbar': { width: 4, height: 4 },
        '*::-webkit-scrollbar-track': { background: palette.bg },
        '*::-webkit-scrollbar-thumb': { background: palette.amberDim },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          background: '#060810',
          borderBottom: `1px solid ${palette.border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0, square: true },
      styleOverrides: {
        root: {
          background: `linear-gradient(180deg, ${palette.bgPanel} 0%, ${palette.paperLift} 100%)`,
          border: `1px solid ${palette.borderSoft}`,
          borderRadius: 14,
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false, size: 'small' },
      styleOverrides: {
        root: {
          minHeight: 32,
          letterSpacing: '0.15em',
          textTransform: 'none',
          borderRadius: 999,
          paddingInline: 14,
          '&.MuiButton-containedPrimary': {
            color: palette.bg,
            background: `linear-gradient(90deg, ${palette.amber} 0%, #ffb340 100%)`,
            '&:hover': { boxShadow: `0 8px 20px ${alpha(palette.amber, 0.38)}` },
          },
        },
        outlined: {
          borderColor: palette.borderSoft,
          color: palette.whiteDim,
          '&:hover': { borderColor: palette.cyan, color: palette.cyan, background: alpha(palette.cyan, 0.10) },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          fontFamily: '"VT323", monospace',
          fontSize: 14,
          letterSpacing: '0.16em',
          textTransform: 'none',
          color: palette.whiteDim,
          borderColor: palette.borderSoft,
          borderRadius: 999,
          padding: '6px 12px',
          '&:hover': { color: palette.cyan, borderColor: palette.cyanDim, background: alpha(palette.cyan, 0.05) },
          '&.Mui-selected': {
            color: palette.bg,
            background: `linear-gradient(90deg, ${palette.amber} 0%, #ffb340 100%)`,
            borderColor: palette.amber,
            boxShadow: `0 8px 18px ${alpha(palette.amber, 0.32)}`,
            '&:hover': { background: `linear-gradient(90deg, ${palette.amber} 0%, #ffb340 100%)` },
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: palette.whiteDim,
          '&.Mui-checked': { color: palette.cyan },
          '&.Mui-checked + .MuiSwitch-track': { background: palette.cyanDim, opacity: 0.9 },
        },
        track: { background: palette.borderSoft, opacity: 1, borderRadius: 999 },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: palette.amber,
          height: 4,
          padding: '8px 0',
        },
        thumb: {
          width: 12, height: 12,
          background: palette.amber,
          boxShadow: `0 0 6px ${alpha(palette.amber, 0.7)}`,
          '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${alpha(palette.amber, 0.16)}` },
        },
        rail: { background: palette.border, opacity: 1 },
        track: { background: palette.amber, border: 'none' },
      },
    },
    MuiSelect: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: {
        outlined: {
          background: palette.bgInput,
          color: '#d7e2ff',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 12,
          letterSpacing: '0.08em',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: palette.bgInput,
          borderRadius: 10,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.borderSoft },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.cyanDim },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.cyan, borderWidth: 1 },
        },
        input: { padding: '6px 10px' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: `linear-gradient(180deg, ${palette.bgPanel} 0%, ${palette.paperLift} 100%)`,
          border: `1px solid ${palette.borderSoft}`,
          borderRadius: 12,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 12,
          letterSpacing: '0.08em',
          color: palette.whiteDim,
          '&.Mui-selected': { background: alpha(palette.amber, 0.17), color: palette.amber },
          '&:hover': { background: alpha(palette.cyan, 0.08), color: palette.cyan },
        },
      },
    },
    MuiChip: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: {
        root: {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 10,
          letterSpacing: '0.1em',
          height: 22,
          borderRadius: 999,
        },
        outlined: { borderColor: palette.borderSoft, color: palette.whiteDim },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: `linear-gradient(180deg, ${palette.bgPanel} 0%, ${palette.paperLift} 100%)`,
          border: `1px solid ${palette.borderSoft}`,
          color: '#d7e2ff',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
          borderRadius: 8,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { background: palette.borderSoft, height: 4, borderRadius: 99 },
        bar: { background: palette.cyan },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: palette.border } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          padding: '4px 8px',
          '&:hover': { background: alpha(palette.cyan, 0.05) },
          '&.Mui-selected': { background: alpha(palette.amber, 0.10) },
        },
      },
    },
  },
})

export const avalonPalette = palette
