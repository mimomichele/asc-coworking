import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import RosticceriaPannello from './RosticceriaPannello.jsx'

export default function RosticceriaLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f3' }}>
      {/* top bar */}
      <nav style={{
        background: '#1a1a1a', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px', height: 54,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 1.5 }}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
          <span style={{ fontSize: 11, color: '#D85A30', fontWeight: 400, marginLeft: 8, letterSpacing: 0 }}>
            Rosticceria
          </span>
        </div>
        <button
          onClick={logout}
          style={{ background: 'none', border: '0.5px solid #444', color: '#888', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
        >
          Esci
        </button>
      </nav>

      {/* contenuto */}
      <main style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <Routes>
          <Route index element={<RosticceriaPannello />} />
        </Routes>
      </main>
    </div>
  )
}
