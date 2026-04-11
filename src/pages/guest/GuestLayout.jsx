import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import GuestHome from './GuestHome.jsx'
import RosticceriaMenu from './rosticceria/RosticceriaMenu.jsx'

export default function GuestLayout({ session }) {
  const navigate = useNavigate()
  const location = useLocation()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const isRosticceria = location.pathname.includes('rosticceria')

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a' }}>
      {/* top bar */}
      <div style={{ background: '#1a1a1a', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: 1.5 }}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
        </div>
        <button onClick={logout} style={{ background: 'none', border: '0.5px solid #444', color: '#888', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
          Esci
        </button>
      </div>

      {/* tab bar navigazione */}
      <div style={{
        background: '#111',
        display: 'flex',
        borderBottom: '0.5px solid #2a2a2a',
      }}>
        <TabButton
          label="Coworking"
          active={!isRosticceria}
          onClick={() => navigate('/guest')}
        />
        <TabButton
          label="Rosticceria"
          active={isRosticceria}
          onClick={() => navigate('/guest/rosticceria')}
        />
      </div>

      {/* contenuto */}
      <div style={{
        background: '#f5f5f3',
        borderRadius: '20px 20px 0 0',
        minHeight: 'calc(100vh - 96px)',
        padding: '20px 16px',
      }}>
        <Routes>
          <Route index element={<GuestHome session={session} />} />
          <Route path="rosticceria" element={<RosticceriaMenu session={session} />} />
        </Routes>
      </div>
    </div>
  )
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 0',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #F5C842' : '2px solid transparent',
        color: active ? '#F5C842' : '#aaa',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all .15s',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  )
}
