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
import LeMieApp from './LeMieApp.jsx'
import RosticceriaPannello from './Rosticceria/RosticceriaPannello.jsx'
import Compliance from './Compliance/Compliance.jsx'
import SchedaAdempimento from './Compliance/SchedaAdempimento.jsx'
import CategorieCompliance from './Compliance/CategorieCompliance.jsx'
import FornitoriCompliance from './Compliance/FornitoriCompliance.jsx'
import DocumentiCompliance from './Compliance/DocumentiCompliance.jsx'
import PlannerTurni from './Turni/PlannerTurni.jsx'
import TurniPredefiniti from './Turni/TurniPredefiniti.jsx'
import Dipendenti from './Turni/Dipendenti.jsx'
import Richieste from './Turni/Richieste.jsx'
import ReportOre from './Turni/ReportOre.jsx'

const RISTORANTE_URL = 'https://ristorante.aschotel.com'

// Path che appartengono alla sezione "Coworking" (URL invariati per non rompere i Link).
const COWORKING_PATHS = ['/admin/coworking', '/admin/ospiti', '/admin/nuovo-ospite', '/admin/abbonamenti', '/admin/esaurimento']

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
  const isCompliance = path.startsWith('/admin/compliance')
  const isLeMieApp = path.startsWith('/admin/le-mie-app')
  const isDash = path === '/admin'

  return (
    <div style={styles.shell}>
      {/* TOP NAV */}
      <nav style={styles.topnav}>
        <div style={styles.logo}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
          <span style={styles.adminBadge}>Admin</span>
        </div>

        {/* DESKTOP LINKS */}
        <div style={styles.navLinks} className="nav-links-desktop">
          <NavLink to="/admin" end style={topStyle(isDash)}>Dashboard</NavLink>
          <NavLink to="/admin/coworking" style={topStyle(isCoworking)}>Coworking</NavLink>
          <NavLink to="/admin/turni" style={topStyle(isTurni)}>Turni</NavLink>
          <NavLink to="/admin/rosticceria" style={rostStyle(isRosticceria)}>Rosticceria</NavLink>
          <NavLink to="/admin/compliance" style={topStyle(isCompliance)}>Compliance</NavLink>
          <a href={RISTORANTE_URL} target="_blank" rel="noopener noreferrer" style={externalLinkStyle}>
            Ristorante <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
          </a>
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
        </div>
      )}

      {/* SUB-NAV COMPLIANCE */}
      {isCompliance && !menuOpen && (
        <div style={styles.subnav} className="compliance-subnav">
          <NavLink to="/admin/compliance" end style={subStyle}>Scadenziario</NavLink>
          <NavLink to="/admin/compliance/categorie" style={subStyle}>Categorie</NavLink>
          <NavLink to="/admin/compliance/fornitori" style={subStyle}>Fornitori</NavLink>
          <NavLink to="/admin/compliance/documenti" style={subStyle}>Documenti</NavLink>
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

          <NavLink to="/admin/turni" style={topStyle(isTurni)} onClick={closeMenu}>Turni</NavLink>
          <NavLink to="/admin/rosticceria" style={rostStyle(isRosticceria)} onClick={closeMenu}>Rosticceria</NavLink>

          <div style={styles.groupLabel}>Compliance</div>
          <NavLink to="/admin/compliance" end style={subStyle} onClick={closeMenu}>Scadenziario</NavLink>
          <NavLink to="/admin/compliance/categorie" style={subStyle} onClick={closeMenu}>Categorie</NavLink>
          <NavLink to="/admin/compliance/fornitori" style={subStyle} onClick={closeMenu}>Fornitori</NavLink>
          <NavLink to="/admin/compliance/documenti" style={subStyle} onClick={closeMenu}>Documenti</NavLink>

          <a href={RISTORANTE_URL} target="_blank" rel="noopener noreferrer" style={externalLinkStyle} onClick={closeMenu}>
            Ristorante <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
          </a>
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
          <Route path="le-mie-app" element={<LeMieApp />} />
          <Route path="turni" element={<PlannerTurni />} />
          <Route path="turni/predefiniti" element={<TurniPredefiniti />} />
          <Route path="turni/dipendenti" element={<Dipendenti />} />
          <Route path="turni/richieste" element={<Richieste />} />
          <Route path="turni/report" element={<ReportOre />} />
          <Route path="rosticceria/*" element={<RosticceriaPannello />} />
          <Route path="compliance" element={<Compliance />} />
          <Route path="compliance/a/:id" element={<SchedaAdempimento />} />
          <Route path="compliance/categorie" element={<CategorieCompliance />} />
          <Route path="compliance/fornitori" element={<FornitoriCompliance />} />
          <Route path="compliance/documenti" element={<DocumentiCompliance />} />
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
    color: active ? '#1a1a1a' : '#aaa',
    background: active ? '#F5C842' : 'transparent',
    textDecoration: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap',
  }
}

// Rosticceria mantiene l'accento arancione.
function rostStyle(active) {
  return {
    padding: '6px 14px', borderRadius: 8, fontSize: 13,
    fontWeight: active ? 500 : 400,
    color: active ? '#1a1a1a' : '#D85A30',
    background: active ? '#D85A30' : 'rgba(216,90,48,0.1)',
    textDecoration: 'none', transition: 'all 0.15s',
    border: '0.5px solid rgba(216,90,48,0.3)', whiteSpace: 'nowrap',
  }
}

// Link esterno (Ristorante): aspetto a riposo, mai "active".
const externalLinkStyle = {
  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 400,
  color: '#aaa', background: 'transparent', textDecoration: 'none',
  transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
}

// Voce della sub-nav coworking.
function subStyle({ isActive }) {
  return {
    padding: '5px 12px', borderRadius: 7, fontSize: 13,
    fontWeight: isActive ? 500 : 400,
    color: isActive ? '#1a1a1a' : '#777',
    background: isActive ? '#fff' : 'transparent',
    border: isActive ? '0.5px solid #e5e5e5' : '0.5px solid transparent',
    textDecoration: 'none', whiteSpace: 'nowrap',
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
  navLinks: { display: 'flex', gap: 4, flex: 1, flexWrap: 'nowrap' },
  subnav: {
    background: '#efeee9', display: 'flex', gap: 6, alignItems: 'center',
    padding: '8px 24px', position: 'sticky', top: 54, zIndex: 99,
    overflowX: 'auto', borderBottom: '0.5px solid #e5e5e5',
  },
  hamburger: {
    background: 'none', border: 'none', color: '#fff',
    fontSize: 22, cursor: 'pointer', marginLeft: 'auto',
  },
  mobileMenu: {
    background: '#1a1a1a', display: 'flex', flexDirection: 'column',
    gap: 6, padding: '16px 24px', position: 'sticky', top: 54, zIndex: 99,
  },
  groupLabel: {
    fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 8, marginBottom: 2, paddingLeft: 4,
  },
  logoutBtn: {
    background: 'none', border: '0.5px solid #444', color: '#888',
    padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
    width: 'fit-content', marginTop: 10,
  },
  main: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
}
