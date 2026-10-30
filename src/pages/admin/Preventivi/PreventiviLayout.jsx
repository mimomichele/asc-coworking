// ============================================================
// Preventivi — layout con sub-nav (pattern Coworking subnav).
// Rotte annidate sotto /admin/preventivi.
// ============================================================

import { Routes, Route, NavLink } from 'react-router-dom'
import PreventiviOggi from './PreventiviOggi.jsx'
import PreventiviTutte from './PreventiviTutte.jsx'
import SchedaRichiesta from './SchedaRichiesta.jsx'
import NuovaRichiesta from './NuovaRichiesta.jsx'
import Contatti from './Contatti.jsx'
import SchedaContatto from './SchedaContatto.jsx'
import Impostazioni from './Impostazioni.jsx'

export default function PreventiviLayout() {
  return (
    <div>
      <div style={styles.subnav} className="preventivi-subnav">
        <NavLink to="/admin/preventivi" end style={subStyle}>Oggi</NavLink>
        <NavLink to="/admin/preventivi/tutte" style={subStyle}>Tutte</NavLink>
        <NavLink to="/admin/preventivi/nuova" style={subStyle}>+ Nuova</NavLink>
        <NavLink to="/admin/preventivi/contatti" style={subStyle}>Contatti</NavLink>
        <NavLink to="/admin/preventivi/impostazioni" style={subStyle}>Impostazioni</NavLink>
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

const styles = {
  subnav: {
    display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
    paddingBottom: 8, borderBottom: '0.5px solid #E5E3DC',
    marginTop: -8, overflowX: 'auto',
  },
}
