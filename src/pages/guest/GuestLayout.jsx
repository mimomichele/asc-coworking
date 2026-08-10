import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import GuestHome from './GuestHome.jsx'
import RosticceriaMenu from './rosticceria/RosticceriaMenu.jsx'
import StaffettaPrenota from './StaffettaPrenota.jsx'
import StaffettaModal from '../../components/StaffettaModal.jsx'

export default function GuestLayout({ session }) {
  const navigate = useNavigate()
  const location = useLocation()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const isRosticceria = location.pathname.includes('rosticceria')
  const isStaffetta = location.pathname.includes('staffetta')

  return (
    <div style={{ minHeight: '100vh', background: '#111111' }}>
      {/* top bar */}
      <div style={{ background: '#111111', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: 1.5 }}>
          ASC <span style={{ color: '#F5B301' }}>HOTEL</span>
        </div>
        <button onClick={logout} style={{ background: 'none', border: '0.5px solid #444', color: '#6B6B6B', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
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
          active={!isRosticceria && !isStaffetta}
          onClick={() => navigate('/guest')}
        />
        <TabButton
          label="Rosticceria"
          active={isRosticceria}
          onClick={() => navigate('/guest/rosticceria')}
        />
        <TabButton
          label="Staffetta"
          active={isStaffetta}
          onClick={() => navigate('/guest/staffetta')}
        />
      </div>

      {/* contenuto */}
      <div style={{
        background: '#F6F5F1',
        borderRadius: '20px 20px 0 0',
        minHeight: 'calc(100vh - 96px)',
        padding: '20px 16px',
      }}>
        <Routes>
          <Route index element={<GuestHome session={session} />} />
          <Route path="rosticceria" element={<RosticceriaMenu session={session} />} />
          <Route path="staffetta" element={<StaffettaPrenota session={session} />} />
        </Routes>
      </div>

      {/* one-shot staffetta "Passa l'Acqua" — solo guest, si autogestisce */}
      <StaffettaModal session={session} />
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
        borderBottom: active ? '2px solid #F5B301' : '2px solid transparent',
        color: active ? '#F5B301' : '#aaa',
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
