import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

import Login from './pages/Login.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import GuestLayout from './pages/guest/GuestLayout.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else { setRole(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole(data?.role || 'guest')
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a' }}>
      <div style={{ color: '#F5C842', fontSize: 18, fontWeight: 500, letterSpacing: 1 }}>ASC HOTEL</div>
    </div>
  )

  if (!session) return <Login />

  return (
    <Routes>
      {role === 'admin'
        ? <Route path="/admin/*" element={<AdminLayout />} />
        : <Route path="/guest/*" element={<GuestLayout session={session} />} />
      }
      <Route path="*" element={<Navigate to={role === 'admin' ? '/admin' : '/guest'} replace />} />
    </Routes>
  )
}
