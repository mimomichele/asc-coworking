import { Routes, Route, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import GuestHome from './GuestHome.jsx'

export default function GuestLayout({ session }) {
  const navigate = useNavigate()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a' }}>
      {/* top bar mobile */}
      <div style={{ background: '#1a1a1a', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: 1.5 }}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
        </div>
        <button onClick={logout} style={{ background: 'none', border: '0.5px solid #444', color: '#888', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
          Esci
        </button>
      </div>

      <div style={{ background: '#f5f5f3', borderRadius: '20px 20px 0 0', minHeight: 'calc(100vh - 54px)', padding: '20px 16px' }}>
        <Routes>
          <Route index element={<GuestHome session={session} />} />
        </Routes>
      </div>
    </div>
  )
}
