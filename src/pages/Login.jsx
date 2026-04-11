import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const usernameClean = username.trim().toLowerCase()

    // Cerca l'email reale dal profilo
    const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('email')
  .eq('username', usernameClean)
  .single()

console.log('profile:', profile, 'error:', profileError)

    if (profileError || !profile) {
      setError('Nome utente o password non corretti')
      setLoading(false)
      return
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    })

    if (loginError) {
      setError('Nome utente o password non corretti')
    }

    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
        </div>
        <p style={styles.subtitle}>Coworking &amp; Piscina</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Nome utente</label>
            <input
              type="text"
              placeholder="es. marco.rossi"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh', background: '#1a1a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '36px 32px',
    width: '100%', maxWidth: 380,
  },
  logo: {
    fontSize: 22, fontWeight: 600, letterSpacing: 2,
    color: '#1a1a1a', textAlign: 'center', marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 28,
  },
  error: {
    background: '#FCEBEB', color: '#A32D2D', padding: '9px 12px',
    borderRadius: 8, fontSize: 13, marginBottom: 12,
  },
}
