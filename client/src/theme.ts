import { createTheme, alpha } from '@mui/material/styles'

// Avalon — ENKIDU palette ported into a Material UI theme.
// Goals:
//   - Keep the Blade-Runner / amber-on-near-black vibe of the existing CSS.
//   - Give every MUI component the right defaults so we don't sprinkle `sx`
//     overrides everywhere.
//   - Keep the VT323 / Share Tech Mono mix the rest of the app uses.

const palette = {
  bg:        '#07080d',
  bgPanel:   '#0b0d14',
  bgInput:   '#0f1119',
  border:    '#1a2035',
  amber:     '#ff9500',
  amberDim:  '#b36900',
  cyan:      '#00e5ff',
  cyanDim:   '#008a99',
  green:     '#39d353',
  red:       '#ff1a40',
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
    text:      { primary: palette.amber, secondary: palette.whiteDim, disabled: alpha(palette.whiteDim, 0.4) },
    divider:   palette.border,
  },
  shape: { borderRadius: 2 },
  typography: {
    fontFamily: '"Share Tech Mono", "Courier New", monospace',
    fontSize: 13,
    h1: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    h2: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    h3: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    h4: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    h5: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    h6: { fontFamily: '"VT323", monospace', letterSpacing: '0.18em' },
    button: { fontFamily: '"VT323", monospace', letterSpacing: '0.2em', fontSize: 14 },
    overline: { fontFamily: '"VT323", monospace', letterSpacing: '0.2em', fontSize: 11 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: palette.bg,
          color: palette.amber,
          WebkitFontSmoothing: 'none',
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
          background: palette.bgPanel,
          border: `1px solid ${palette.border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false, size: 'small' },
      styleOverrides: {
        root: {
          minHeight: 32,
          letterSpacing: '0.18em',
          textTransform: 'none',
          borderRadius: 2,
          '&.MuiButton-containedPrimary': {
            color: palette.bg,
            background: palette.amber,
            '&:hover': { background: '#ffb340', boxShadow: `0 0 12px ${alpha(palette.amber, 0.4)}` },
          },
        },
        outlined: {
          borderColor: palette.border,
          color: palette.whiteDim,
          '&:hover': { borderColor: palette.cyan, color: palette.cyan, background: alpha(palette.cyan, 0.06) },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          fontFamily: '"VT323", monospace',
          fontSize: 14,
          letterSpacing: '0.2em',
          textTransform: 'none',
          color: palette.whiteDim,
          borderColor: palette.border,
          padding: '4px 10px',
          '&:hover': { color: palette.cyan, borderColor: palette.cyanDim, background: alpha(palette.cyan, 0.05) },
          '&.Mui-selected': {
            color: palette.bg,
            background: palette.amber,
            borderColor: palette.amber,
            boxShadow: `0 0 10px ${alpha(palette.amber, 0.35)}`,
            '&:hover': { background: '#ffb340' },
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
        track: { background: palette.border, opacity: 1 },
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
          color: palette.amber,
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
          '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.cyanDim },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.cyan, borderWidth: 1 },
        },
        input: { padding: '6px 10px' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: palette.bgPanel,
          border: `1px solid ${palette.border}`,
          borderRadius: 2,
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
          '&.Mui-selected': { background: alpha(palette.amber, 0.12), color: palette.amber },
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
          height: 18,
          borderRadius: 2,
        },
        outlined: { borderColor: palette.border, color: palette.whiteDim },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: palette.bgPanel,
          border: `1px solid ${palette.border}`,
          color: palette.amber,
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { background: palette.border, height: 2 },
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
