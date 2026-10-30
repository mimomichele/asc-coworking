// ============================================================
// Preventivi — layout con sub-nav (pattern Coworking subnav).
// Tab principali: Oggi, Tutte, + Nuova. Contatti e Impostazioni
// stanno nel menu "Altro" a destra, per non affollare la barra
// (soprattutto da telefono). Rotte annidate sotto /admin/preventivi.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import PreventiviOggi from './PreventiviOggi.jsx'
import PreventiviTutte from './PreventiviTutte.jsx'
import SchedaRichiesta from './SchedaRichiesta.jsx'
import NuovaRichiesta from './NuovaRichiesta.jsx'
import Contatti from './Contatti.jsx'
import SchedaContatto from './SchedaContatto.jsx'
import Impostazioni from './Impostazioni.jsx'

export default function PreventiviLayout() {
  const location = useLocation()
  const [altroAperto, setAltroAperto] = useState(false)
  const altroRef = useRef(null)

  useEffect(() => { setAltroAperto(false) }, [location.pathname])

  useEffect(() => {
    if (!altroAperto) return
    const chiudi = (e) => {
      if (altroRef.current && !altroRef.current.contains(e.target)) setAltroAperto(false)
    }
    document.addEventListener('mousedown', chiudi)
    return () => document.removeEventListener('mousedown', chiudi)
  }, [altroAperto])

  const path = location.pathname
  const inAltro = path.startsWith('/admin/preventivi/contatti') || path.startsWith('/admin/preventivi/impostazioni')

  return (
    <div>
      <div style={styles.subnav} className="preventivi-subnav">
        <NavLink to="/admin/preventivi" end style={subStyle}>Oggi</NavLink>
        <NavLink to="/admin/preventivi/tutte" style={subStyle}>Tutte</NavLink>
        <NavLink to="/admin/preventivi/nuova" style={subStyle}>+ Nuova</NavLink>

        <div ref={altroRef} style={{ marginLeft: 'auto', position: 'relative' }}>
          <button onClick={() => setAltroAperto(a => !a)}
                  style={{ ...subStyle({ isActive: inAltro || altroAperto }), cursor: 'pointer', fontFamily: 'inherit' }}>
            Altro ▾
          </button>
          {altroAperto && (
            <div style={styles.menu}>
              <NavLink to="/admin/preventivi/contatti" style={menuItemStyle}>Contatti</NavLink>
              <NavLink to="/admin/preventivi/impostazioni" style={menuItemStyle}>Impostazioni</NavLink>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Routes>
          <Route index element={<PreventiviOggi />} />
          <Route path="tutte" element={<PreventiviTutte />} />
          <Route path="nuova" element={<NuovaRichiesta />} />
          <Route path="richiesta/:id" element={<SchedaRichiesta />} />
          <Route path="contatti" element={<Contatti />} />
          <Route path="contatti/:id" element={<SchedaContatto />} />
          <Route path="impostazioni" element={<Impostazioni />} />
        </Routes>
      </div>
    </div>
  )
}

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

function menuItemStyle({ isActive }) {
  return {
    display: 'block', padding: '8px 14px', fontSize: 13,
    color: isActive ? '#111111' : '#333',
    fontWeight: isActive ? 500 : 400,
    background: isActive ? '#F6F5F1' : 'transparent',
    textDecoration: 'none', whiteSpace: 'nowrap',
  }
}

const styles = {
  subnav: {
    display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
    paddingBottom: 8, borderBottom: '0.5px solid #E5E3DC',
    marginTop: -8,
  },
  menu: {
    position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 160,
    background: '#fff', border: '0.5px solid #E5E3DC', borderRadius: 8,
    boxShadow: '0 6px 18px rgba(0,0,0,0.08)', padding: '4px 0', zIndex: 50,
    overflow: 'hidden',
  },
}
