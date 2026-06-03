import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { fetchUserHasSigned } from './lib/contract'

import Login from './pages/Login.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import GuestLayout from './pages/guest/GuestLayout.jsx'
import RosticceriaLayout from './pages/rosticceria/RosticceriaLayout.jsx'
import DipendenteLayout from './pages/dipendente/DipendenteLayout.jsx'
import ContrattoFirma from './pages/guest/ContrattoFirma.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  // null = ancora da determinare; true = ospite attivo / N/A per altri ruoli;
  // false = ospite disattivato → schermata di stop.
  const [accountAttivo, setAccountAttivo] = useState(null)
  // null = ancora da determinare; true = ha firmato / N/A; false = deve firmare.
  const [hasSigned, setHasSigned] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRoleAndStatus(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRoleAndStatus(session.user.id)
      else { setRole(null); setAccountAttivo(null); setHasSigned(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchRoleAndStatus(userId) {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles').select('role').eq('id', userId).single()
    if (profileErr) console.error('[App.fetchRoleAndStatus profile]', profileErr)
    const r = profile?.role || 'guest'
    setRole(r)

    // Per il ruolo guest fetcho anche accounts.attivo + lo stato di firma
    // per i gating. Per admin/rosticceria non servono (non hanno membership).
    if (r === 'guest') {
      // attivo?
      const { data: acc, error: accErr } = await supabase
        .from('accounts').select('attivo').eq('owner_id', userId).maybeSingle()
      if (accErr) console.error('[App.fetchRoleAndStatus account]', accErr)
      // Default true: se il record non esiste o attivo è null/undefined, NON blocco.
      // Blocco solo se attivo è esplicitamente false.
      setAccountAttivo(acc?.attivo !== false)

      // ha firmato il contratto?
      const { hasSigned: signed } = await fetchUserHasSigned(userId)
      setHasSigned(signed)
    } else {
      setAccountAttivo(true)
      setHasSigned(true)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a' }}>
      <div style={{ color: '#F5C842', fontSize: 18, fontWeight: 500, letterSpacing: 1 }}>ASC HOTEL</div>
    </div>
  )

  if (!session) return <Login />

  // Gating ORDINATO:
  //   1. guest disattivato → schermata "Account disattivato"
  //   2. guest che non ha ancora firmato → schermata di firma contratto
  //   3. resto: routing normale per ruolo
  // L'ordine è importante: un disattivato non firma (la sua membership è
  // sospesa); un attivo che non ha firmato vede solo la schermata firma.
  if (role === 'guest' && accountAttivo === false) {
    return <AccountDisattivato />
  }
  if (role === 'guest' && hasSigned === false) {
    return (
      <ContrattoFirma
        session={session}
        onSigned={() => fetchRoleAndStatus(session.user.id)}
      />
    )
  }

  return (
    <Routes>
      {role === 'admin' && (
        <Route path="/admin/*" element={<AdminLayout />} />
      )}
      {role === 'rosticceria' && (
        <Route path="/rosticceria/*" element={<RosticceriaLayout />} />
      )}
      {role === 'dipendente' && (
        <Route path="/dipendente/*" element={<DipendenteLayout session={session} />} />
      )}
      {role === 'guest' && (
        <Route path="/guest/*" element={<GuestLayout session={session} />} />
      )}
      <Route
        path="*"
        element={
          <Navigate
            to={
              role === 'admin' ? '/admin' :
              role === 'rosticceria' ? '/rosticceria' :
              role === 'dipendente' ? '/dipendente' :
              '/guest'
            }
            replace
          />
        }
      />
    </Routes>
  )
}

// Schermata mostrata ai guest il cui accounts.attivo=false.
// Lato Auth sono già bannati: se questa schermata appare è perché
// la sessione era già attiva al momento della disattivazione (max ~1h
// di tolleranza prima che il token scada). Resta comunque bloccato qui.
function AccountDisattivato() {
  async function logout() { await supabase.auth.signOut() }
  return (
    <div style={{
      minHeight: '100vh', background: '#1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '36px 32px',
        width: '100%', maxWidth: 420, textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2, color: '#1a1a1a', marginBottom: 4 }}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
        </div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Coworking &amp; Piscina</p>
        <div style={{
          background: '#FCEBEB', borderRadius: 10, padding: '14px 16px',
          fontSize: 14, color: '#A32D2D', marginBottom: 20, lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Account disattivato</div>
          <div style={{ fontSize: 13 }}>
            Il tuo account non è attualmente abilitato all'accesso.
            Per informazioni contatta la reception.
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            background: 'none', border: '0.5px solid #ddd', color: '#888',
            padding: '9px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
          }}
        >
          Esci
        </button>
      </div>
    </div>
  )
}
