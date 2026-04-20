import SitingPanel from './components/SitingPanel'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      <header style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 42, zIndex: 10,
        background: '#060810', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--amber)',
          textShadow: '0 0 12px var(--amber), 0 0 24px var(--amber-glow)',
          letterSpacing: '0.2em',
        }}>
          AVALON
        </span>
        <span style={{ fontSize: 11, color: 'var(--white-dim)', letterSpacing: '0.1em' }}>
          DATACENTER SITING · 14-FACTOR COMPOSITE
        </span>
        <a
          href="https://bpachter.github.io"
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--white-dim)', textDecoration: 'none', letterSpacing: '0.1em' }}
        >
          ← PORTFOLIO
        </a>
      </header>
      <div style={{ position: 'absolute', inset: '42px 0 0 0' }}>
        <SitingPanel />
      </div>
    </div>
  )
}
