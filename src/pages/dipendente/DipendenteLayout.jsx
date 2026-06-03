import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nomeDipendente } from '../../lib/turni'
import MieiTurni from './MieiTurni.jsx'
import NuovaAssenza from './NuovaAssenza.jsx'
import MieRichieste from './MieRichieste.jsx'

export default function DipendenteLayout({ session }) {
  const navigate = useNavigate()
  const [dip, setDip] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDip() }, [])

  async function fetchDip() {
    const { data } = await supabase
      .from('dipendenti').select('*').eq('profile_id', session.user.id).maybeSingle()
    setDip(data || null)
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F5C842' }}>
      Caricamento...
    </div>
  )

  if (!dip) return (
    <div style={styles.shell}>
      <Header nome="" onLogout={logout} />
      <div style={{ padding: 24 }}>
        <div className="card" style={{ textAlign: 'center', color: '#888' }}>
          Il tuo profilo dipendente non è collegato. Contatta l'amministrazione.
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.shell}>
      <Header nome={nomeDipendente(dip)} onLogout={logout} />

      <main style={styles.main}>
        <Routes>
          <Route index element={<MieiTurni dipendente={dip} />} />
          <Route path="assenza" element={<NuovaAssenza dipendente={dip} />} />
          <Route path="richieste" element={<MieRichieste dipendente={dip} />} />
        </Routes>
      </main>

      <nav style={styles.bottomNav}>
        <NavLink to="/dipendente" end style={tabStyle}>
          <span style={{ fontSize: 18 }}>📅</span><span>Turni</span>
        </NavLink>
        <NavLink to="/dipendente/assenza" style={tabStyle}>
          <span style={{ fontSize: 18 }}>🏖️</span><span>Assenze</span>
        </NavLink>
        <NavLink to="/dipendente/richieste" style={tabStyle}>
          <span style={{ fontSize: 18 }}>📨</span><span>Richieste</span>
        </NavLink>
      </nav>
    </div>
  )
}

function Header({ nome, onLogout }) {
  return (
    <header style={styles.header}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 1.5 }}>
        ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {nome && <span style={{ fontSize: 12, color: '#aaa' }}>{nome}</span>}
        <button onClick={onLogout} style={styles.logoutBtn}>Esci</button>
      </div>
    </header>
  )
}

function tabStyle({ isActive }) {
  return {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 0', fontSize: 11, textDecoration: 'none',
    color: isActive ? '#1a1a1a' : '#999',
    fontWeight: isActive ? 600 : 400,
  }
}

const styles = {
  shell: { minHeight: '100vh', background: '#f5f5f3', paddingBottom: 64 },
  header: {
    background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', height: 52, position: 'sticky', top: 0, zIndex: 100,
  },
  logoutBtn: {
    background: 'none', border: '0.5px solid #444', color: '#888',
    padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  },
  main: { padding: '16px', maxWidth: 600, margin: '0 auto' },
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
    background: '#fff', borderTop: '0.5px solid #e5e5e5',
    display: 'flex', alignItems: 'stretch', zIndex: 100,
  },
}
