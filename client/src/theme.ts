import { createTheme, alpha } from '@mui/material/styles'

// Avalon — Signal Intelligence design system.
//   Deep blue-black surfaces, sky-blue primary signal, emerald/amber/rose
//   score gradient, violet for selection. Two fonts only:
//     - Space Grotesk for UI labels and body text
//     - JetBrains Mono for numeric data values
//   Rajdhani is reserved for large composite-score numerals.

const palette = {
  bg:          '#050810',
  bgPanel:     '#0a1020',
  bgInput:     '#0f172a',
  border:      '#1e2a3d',
  borderSoft:  '#2d4060',
  signal:      '#0ea5e9',
  signalDim:   '#0369a1',
  emerald:     '#10b981',
  amber:       '#f59e0b',
  amberDim:    '#92400e',
  rose:        '#f43f5e',
  violet:      '#818cf8',
  paperLift:   '#131f35',
  whiteDim:    '#64748b',
  textPrimary: '#e2e8f0',
  textBright:  '#f8fafc',
  // Backwards-compat aliases — many existing call sites still reference
  // the old token names. Keep them mapped to the new values so we never
  // ship a broken color.
  cyan:        '#0ea5e9',
  cyanDim:     '#0369a1',
  green:       '#10b981',
  red:         '#f43f5e',
  indigo:      '#818cf8',
}

export const avalonTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:   { main: palette.signal,  dark: palette.signalDim, contrastText: palette.bg },
    secondary: { main: palette.violet,  dark: '#4338ca',         contrastText: palette.bg },
    success:   { main: palette.emerald },
    error:     { main: palette.rose    },
    warning:   { main: palette.amber   },
    background:{ default: palette.bg, paper: palette.bgPanel },
    info:      { main: palette.violet  },
    text:      { primary: palette.textPrimary, secondary: palette.whiteDim, disabled: alpha(palette.whiteDim, 0.4) },
    divider:   palette.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Space Grotesk", system-ui, sans-serif',
    fontSize: 13,
    h1: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    h2: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    h3: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    h4: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    h5: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    h6: { fontFamily: '"Rajdhani", "Space Grotesk", sans-serif', letterSpacing: '0.06em', fontWeight: 700 },
    button:   { fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '0.06em', fontSize: 13, fontWeight: 600 },
    overline: { fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '0.14em', fontSize: 11, fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: palette.bg,
          color: palette.textPrimary,
          WebkitFontSmoothing: 'antialiased',
          backgroundImage:
            'radial-gradient(circle at 7% 14%, rgba(14,165,233,0.06) 0%, transparent 32%), radial-gradient(circle at 92% 0%, rgba(129,140,248,0.08) 0%, transparent 40%)',
        },
        '*::-webkit-scrollbar': { width: 6, height: 6 },
        '*::-webkit-scrollbar-track': { background: palette.bg },
        '*::-webkit-scrollbar-thumb': { background: palette.border, borderRadius: 4 },
        '*::-webkit-scrollbar-thumb:hover': { background: palette.signal },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          background: palette.bgPanel,
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
          border: `1px solid ${palette.border}`,
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
          letterSpacing: '0.06em',
          textTransform: 'none',
          borderRadius: 10,
          paddingInline: 14,
          fontWeight: 600,
          '&.MuiButton-containedPrimary': {
            color: '#ffffff',
            background: `linear-gradient(90deg, ${palette.signal} 0%, #38bdf8 100%)`,
            '&:hover': { boxShadow: `0 0 20px ${alpha(palette.signal, 0.3)}` },
          },
        },
        outlined: {
          borderColor: palette.border,
          color: palette.textPrimary,
          '&:hover': { borderColor: palette.signal, color: palette.signal, background: alpha(palette.signal, 0.08) },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'none',
          color: palette.whiteDim,
          borderColor: palette.border,
          borderRadius: 999,
          padding: '6px 12px',
          fontWeight: 600,
          '&:hover': { color: palette.signal, borderColor: palette.signalDim, background: alpha(palette.signal, 0.05) },
          '&.Mui-selected': {
            color: '#ffffff',
            background: `linear-gradient(90deg, ${palette.signal} 0%, ${palette.violet} 100%)`,
            borderColor: palette.signal,
            boxShadow: `0 0 14px ${alpha(palette.signal, 0.4)}`,
            '&:hover': { background: `linear-gradient(90deg, ${palette.signal} 0%, ${palette.violet} 100%)` },
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: palette.whiteDim,
          '&.Mui-checked': { color: palette.signal },
          '&.Mui-checked + .MuiSwitch-track': { background: palette.signalDim, opacity: 0.9 },
        },
        track: { background: palette.border, opacity: 1, borderRadius: 999 },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: palette.signal,
          height: 4,
          padding: '8px 0',
        },
        thumb: {
          width: 12, height: 12,
          background: palette.signal,
          boxShadow: `0 0 6px ${alpha(palette.signal, 0.7)}`,
          '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${alpha(palette.signal, 0.16)}` },
        },
        rail: { background: palette.border, opacity: 1 },
        track: { background: palette.signal, border: 'none' },
      },
    },
    MuiSelect: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: {
        outlined: {
          background: palette.bgInput,
          color: palette.textPrimary,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
          letterSpacing: '0.04em',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: palette.bgInput,
          borderRadius: 10,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.borderSoft },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.signal, borderWidth: 1 },
        },
        input: { padding: '6px 10px' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: `linear-gradient(180deg, ${palette.bgPanel} 0%, ${palette.paperLift} 100%)`,
          border: `1px solid ${palette.border}`,
          borderRadius: 12,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 12,
          letterSpacing: '0.04em',
          color: palette.textPrimary,
          '&.Mui-selected': { background: alpha(palette.signal, 0.18), color: palette.signal },
          '&:hover': { background: alpha(palette.signal, 0.08), color: palette.signal },
        },
      },
    },
    MuiChip: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: {
        root: {
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 10,
          letterSpacing: '0.06em',
          height: 22,
          borderRadius: 999,
          fontWeight: 600,
        },
        outlined: { borderColor: palette.border, color: palette.textPrimary },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: `linear-gradient(180deg, ${palette.bgPanel} 0%, ${palette.paperLift} 100%)`,
          border: `1px solid ${palette.border}`,
          color: palette.textPrimary,
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 11,
          letterSpacing: '0.03em',
          borderRadius: 8,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { background: palette.border, height: 4, borderRadius: 99 },
        bar: { background: palette.signal },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: palette.border } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          padding: '4px 8px',
          '&:hover': { background: alpha(palette.signal, 0.06) },
          '&.Mui-selected': { background: alpha(palette.signal, 0.12) },
        },
      },
    },
  },
})

export const avalonPalette = palette
