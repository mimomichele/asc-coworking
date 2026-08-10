import { useState } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import DashboardHome from './DashboardHome.jsx'
import Dashboard from './Dashboard.jsx'
import Ospiti from './Ospiti.jsx'
import NuovoOspite from './NuovoOspite.jsx'
import SchedaOspite from './SchedaOspite.jsx'
import TipiAbbonamento from './TipiAbbonamento.jsx'
import InEsaurimento from './InEsaurimento.jsx'
import Esauriti from './Esauriti.jsx'
import LeMieApp from './LeMieApp.jsx'
import Staffetta from './Staffetta.jsx'
import RosticceriaPannello from './Rosticceria/RosticceriaPannello.jsx'
import PlannerTurni from './Turni/PlannerTurni.jsx'
import TurniPredefiniti from './Turni/TurniPredefiniti.jsx'
import Dipendenti from './Turni/Dipendenti.jsx'
import Richieste from './Turni/Richieste.jsx'
import ReportOre from './Turni/ReportOre.jsx'

// Regola ASC-DESIGN: la barra in alto tiene SOLO le sezioni native della
// dashboard; le app esterne (Ristorante, Manutenzione, ecc.) vivono solo
// nel launcher "Le mie app".

// Path che appartengono alla sezione "Coworking" (URL invariati per non rompere i Link).
const COWORKING_PATHS = ['/admin/coworking', '/admin/ospiti', '/admin/nuovo-ospite', '/admin/abbonamenti', '/admin/esaurimento', '/admin/esauriti']

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const closeMenu = () => setMenuOpen(false)

  const path = location.pathname
  const isCoworking = COWORKING_PATHS.some(p => path === p || path.startsWith(p + '/'))
  const isTurni = path.startsWith('/admin/turni')
  const isRosticceria = path.startsWith('/admin/rosticceria')
  const isLeMieApp = path.startsWith('/admin/le-mie-app')
  const isStaffetta = path.startsWith('/admin/staffetta')
  const isDash = path === '/admin'

  return (
    <div style={styles.shell}>
      {/* TOP NAV */}
      <nav style={styles.topnav}>
        <div style={styles.logo}>
          ASC <span style={{ color: '#F5B301' }}>HOTEL</span>
          <span style={styles.adminBadge}>Admin</span>
        </div>

        {/* DESKTOP LINKS */}
        <div style={styles.navLinks} className="nav-links-desktop">
          <NavLink to="/admin" end style={topStyle(isDash)}>Dashboard</NavLink>
          <NavLink to="/admin/coworking" style={topStyle(isCoworking)}>Coworking</NavLink>
          <NavLink to="/admin/turni" style={topStyle(isTurni)}>Turni</NavLink>
          <NavLink to="/admin/rosticceria" style={topStyle(isRosticceria)}>Rosticceria</NavLink>
          <NavLink to="/admin/staffetta" style={topStyle(isStaffetta)}>Staffetta</NavLink>
          <NavLink to="/admin/le-mie-app" style={topStyle(isLeMieApp)}>Le mie app</NavLink>
        </div>

        <button onClick={logout} style={{ ...styles.logoutBtn }} className="logout-desktop">Esci</button>

        {/* HAMBURGER */}
        <button onClick={() => setMenuOpen(!menuOpen)} style={styles.hamburger} className="hamburger-btn">
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* SUB-NAV COWORKING (desktop+tablet, quando si è in una sezione coworking) */}
      {isCoworking && !menuOpen && (
        <div style={styles.subnav} className="coworking-subnav">
          <NavLink to="/admin/coworking" end style={subStyle}>Dashboard coworking</NavLink>
          <NavLink to="/admin/ospiti" style={subStyle}>Ospiti</NavLink>
          <NavLink to="/admin/nuovo-ospite" style={subStyle}>+ Nuovo ospite</NavLink>
          <NavLink to="/admin/abbonamenti" style={subStyle}>Tipi di abbonamento</NavLink>
          <NavLink to="/admin/esaurimento" style={subStyle}>In esaurimento</NavLink>
          <NavLink to="/admin/esauriti" style={subStyle}>Esauriti</NavLink>
        </div>
      )}

      {/* MOBILE MENU */}
      {menuOpen && (
        <div style={styles.mobileMenu} className="mobile-menu">
          <NavLink to="/admin" end style={topStyle(isDash)} onClick={closeMenu}>Dashboard</NavLink>

          <div style={styles.groupLabel}>Coworking</div>
          <NavLink to="/admin/coworking" end style={subStyle} onClick={closeMenu}>Dashboard coworking</NavLink>
          <NavLink to="/admin/ospiti" style={subStyle} onClick={closeMenu}>Ospiti</NavLink>
          <NavLink to="/admin/nuovo-ospite" style={subStyle} onClick={closeMenu}>+ Nuovo ospite</NavLink>
          <NavLink to="/admin/abbonamenti" style={subStyle} onClick={closeMenu}>Tipi di abbonamento</NavLink>
          <NavLink to="/admin/esaurimento" style={subStyle} onClick={closeMenu}>In esaurimento</NavLink>
          <NavLink to="/admin/esauriti" style={subStyle} onClick={closeMenu}>Esauriti</NavLink>

          <NavLink to="/admin/turni" style={topStyle(isTurni)} onClick={closeMenu}>Turni</NavLink>
          <NavLink to="/admin/rosticceria" style={topStyle(isRosticceria)} onClick={closeMenu}>Rosticceria</NavLink>
          <NavLink to="/admin/staffetta" style={topStyle(isStaffetta)} onClick={closeMenu}>Staffetta</NavLink>
          <NavLink to="/admin/le-mie-app" style={topStyle(isLeMieApp)} onClick={closeMenu}>Le mie app</NavLink>

          <button onClick={logout} style={styles.logoutBtn}>Esci</button>
        </div>
      )}

      {/* CONTENT */}
      <main style={styles.main}>
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="coworking" element={<Dashboard />} />
          <Route path="ospiti" element={<Ospiti />} />
          <Route path="ospiti/:id" element={<SchedaOspite />} />
          <Route path="nuovo-ospite" element={<NuovoOspite />} />
          <Route path="abbonamenti" element={<TipiAbbonamento />} />
          <Route path="esaurimento" element={<InEsaurimento />} />
          <Route path="esauriti" element={<Esauriti />} />
          <Route path="le-mie-app" element={<LeMieApp />} />
          <Route path="staffetta" element={<Staffetta />} />
          <Route path="turni" element={<PlannerTurni />} />
          <Route path="turni/predefiniti" element={<TurniPredefiniti />} />
          <Route path="turni/dipendenti" element={<Dipendenti />} />
          <Route path="turni/richieste" element={<Richieste />} />
          <Route path="turni/report" element={<ReportOre />} />
          <Route path="rosticceria/*" element={<RosticceriaPannello />} />
        </Routes>
      </main>
    </div>
  )
}

// Stile voce top-nav (giallo). active = gruppo corrente attivo.
function topStyle(active) {
  return {
    padding: '6px 14px', borderRadius: 8, fontSize: 13,
    fontWeight: active ? 500 : 400,
    color: active ? '#111111' : '#aaa',
    background: active ? '#F5B301' : 'transparent',
    textDecoration: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap',
  }
}

// Voce della sub-nav coworking.
function subStyle({ isActive }) {
  return {
    padding: '5px 12px', borderRadius: 7, fontSize: 13,
    fontWeight: isActive ? 500 : 400,
    color: isActive ? '#111111' : '#777',
    background: isActive ? '#fff' : 'transparent',
    border: isActive ? '0.5px solid #E5E3DC' : '0.5px solid transparent',
    textDecoration: 'none', whiteSpace: 'nowrap',
  }
}

const styles = {
  shell: { minHeight: '100vh', background: '#F6F5F1' },
  topnav: {
    background: '#111111', display: 'flex', alignItems: 'center',
    gap: 8, padding: '0 24px', height: 54, position: 'sticky', top: 0, zIndex: 100,
  },
  logo: { fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 1.5, marginRight: 16, whiteSpace: 'nowrap' },
  adminBadge: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 400, marginLeft: 8, letterSpacing: 0 },
  navLinks: { display: 'flex', gap: 4, flex: 1, flexWrap: 'nowrap' },
  subnav: {
    background: '#efeee9', display: 'flex', gap: 6, alignItems: 'center',
    padding: '8px 24px', position: 'sticky', top: 54, zIndex: 99,
    overflowX: 'auto', borderBottom: '0.5px solid #E5E3DC',
  },
  hamburger: {
    background: 'none', border: 'none', color: '#fff',
    fontSize: 22, cursor: 'pointer', marginLeft: 'auto',
  },
  mobileMenu: {
    background: '#111111', display: 'flex', flexDirection: 'column',
    gap: 6, padding: '16px 24px', position: 'sticky', top: 54, zIndex: 99,
  },
  groupLabel: {
    fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 8, marginBottom: 2, paddingLeft: 4,
  },
  logoutBtn: {
    background: 'none', border: '0.5px solid #444', color: '#6B6B6B',
    padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
    width: 'fit-content', marginTop: 10,
  },
  main: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
}
