import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Dashboard from './Dashboard.jsx'
import Ospiti from './Ospiti.jsx'
import NuovoOspite from './NuovoOspite.jsx'
import SchedaOspite from './SchedaOspite.jsx'
import TipiAbbonamento from './TipiAbbonamento.jsx'
import InEsaurimento from './InEsaurimento.jsx'
import RosticceriaPannello from './Rosticceria/RosticceriaPannello.jsx'

export default function AdminLayout() {
  const navigate = useNavigate()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div style={styles.shell}>
      {/* TOP NAV */}
      <nav style={styles.topnav}>
        <div style={styles.logo}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
          <span style={styles.adminBadge}>Admin</span>
        </div>
        <div style={styles.navLinks}>
          <NavLink to="/admin" end style={navStyle}>Dashboard</NavLink>
          <NavLink to="/admin/ospiti" style={navStyle}>Ospiti</NavLink>
          <NavLink to="/admin/nuovo-ospite" style={navStyle}>+ Nuovo ospite</NavLink>
          <NavLink to="/admin/abbonamenti" style={navStyle}>Tipi abbonamento</NavLink>
          <NavLink to="/admin/esaurimento" style={navStyle}>In esaurimento</NavLink>
          <NavLink to="/admin/rosticceria" style={navStyleRosticceria}>Rosticceria</NavLink>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>Esci</button>
      </nav>

      {/* CONTENT */}
      <main style={styles.main}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="ospiti" element={<Ospiti />} />
          <Route path="ospiti/:id" element={<SchedaOspite />} />
          <Route path="nuovo-ospite" element={<NuovoOspite />} />
          <Route path="abbonamenti" element={<TipiAbbonamento />} />
          <Route path="esaurimento" element={<InEsaurimento />} />
          <Route path="rosticceria/*" element={<RosticceriaPannello />} />
        </Routes>
      </main>
    </div>
  )
}

function navStyle({ isActive }) {
  return {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: isActive ? 500 : 400,
    color: isActive ? '#1a1a1a' : '#aaa',
    background: isActive ? '#F5C842' : 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s',
  }
}

function navStyleRosticceria({ isActive }) {
  return {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: isActive ? 500 : 400,
    color: isActive ? '#1a1a1a' : '#D85A30',
    background: isActive ? '#D85A30' : 'rgba(216,90,48,0.1)',
    textDecoration: 'none',
    transition: 'all 0.15s',
    border: '0.5px solid rgba(216,90,48,0.3)',
  }
}

const styles = {
  shell: { minHeight: '100vh', background: '#f5f5f3' },
  topnav: {
    background: '#1a1a1a', display: 'flex', alignItems: 'center',
    gap: 8, padding: '0 24px', height: 54, position: 'sticky', top: 0, zIndex: 100,
  },
  logo: { fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 1.5, marginRight: 16, whiteSpace: 'nowrap' },
  adminBadge: { fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 8, letterSpacing: 0 },
  navLinks: { display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' },
  logoutBtn: { background: 'none', border: '0.5px solid #444', color: '#888', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  main: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
}
