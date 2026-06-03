import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// App esterne (progetti separati: aprono in nuova scheda, nessuna integrazione).
const APP_ESTERNE = [
  { label: 'Ristorante', url: 'https://ristorante.aschotel.com' },
  { label: 'Compliance', url: 'https://asc-compliance.vercel.app' },
  { label: 'Pulizie', url: 'https://gregarious-raindrop-4cea90.netlify.app' },
  { label: 'Turni Bagnini', url: 'https://turni-bagnini.vercel.app' },
]

export default function DashboardHome() {
  const navigate = useNavigate()
  const [m, setM] = useState({ ospiti: 0, esaurimento: 0, prenotazioniOggi: 0, richieste: 0, dipendenti: 0 })
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchMetriche() }, [])

  async function fetchMetriche() {
    const [accounts, subs, bookings, scr, leave, dip] = await Promise.all([
      supabase.from('accounts').select('id, attivo'),
      supabase.from('subscriptions').select('entries_total, entries_used').eq('active', true),
      supabase.from('bookings').select('id').eq('date', today).neq('status', 'cancelled'),
      supabase.from('shift_change_requests').select('id', { count: 'exact', head: true }).eq('stato', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('stato', 'pending'),
      supabase.from('dipendenti').select('id', { count: 'exact', head: true }).eq('attivo', true),
    ])
    const ospitiAttivi = (accounts.data || []).filter(a => a.attivo !== false).length
    const esaurimento = (subs.data || []).filter(s => (s.entries_total - s.entries_used) <= 3).length
    setM({
      ospiti: ospitiAttivi,
      esaurimento,
      prenotazioniOggi: (bookings.data || []).length,
      richieste: (scr.count || 0) + (leave.count || 0),
      dipendenti: dip.count || 0,
    })
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Dashboard</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Riepilogo a colpo d'occhio</div>

      {/* METRICHE */}
      <div style={styles.grid}>
        <Metric label="Ospiti attivi" value={m.ospiti} sub="account abilitati" />
        <Metric
          label="In esaurimento" value={m.esaurimento} sub="≤ 3 ingressi rimasti"
          tone={m.esaurimento > 0 ? 'warn' : undefined}
          onClick={m.esaurimento > 0 ? () => navigate('/admin/esaurimento') : undefined}
        />
        <Metric label="Prenotazioni oggi" value={m.prenotazioniOggi} sub="coworking / piscina" />
        <Metric
          label="Richieste turni" value={m.richieste} sub="in attesa di approvazione"
          tone={m.richieste > 0 ? 'alert' : undefined}
          onClick={m.richieste > 0 ? () => navigate('/admin/turni/richieste') : undefined}
        />
        <Metric label="Dipendenti attivi" value={m.dipendenti} sub="in organico" />
      </div>

      {/* SCORCIATOIE INTERNE */}
      <h3 style={styles.h3}>Sezioni</h3>
      <div style={styles.grid}>
        <ShortcutInterna to="/admin/coworking" titolo="Coworking" desc="Ospiti, abbonamenti, prenotazioni" />
        <ShortcutInterna to="/admin/turni" titolo="Turni" desc="Planner, richieste, report ore" />
        <ShortcutInterna to="/admin/rosticceria" titolo="Rosticceria" desc="Ordini, produzione, menù" />
      </div>

      {/* APP ESTERNE */}
      <h3 style={styles.h3}>App esterne</h3>
      <div style={styles.grid}>
        {APP_ESTERNE.map(a => (
          <a key={a.label} href={a.url} target="_blank" rel="noopener noreferrer" style={styles.card}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 6 }}>
              {a.label} <span aria-hidden="true" style={{ fontSize: 12, opacity: 0.6 }}>↗</span>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>apre in una nuova scheda</div>
          </a>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, sub, tone, onClick }) {
  const toneStyle = tone === 'warn'
    ? { background: '#FAEEDA', borderColor: '#F0D9A8' }
    : tone === 'alert'
      ? { background: '#FCEBEB', borderColor: '#F2C9C9' }
      : {}
  const valueColor = tone === 'warn' ? '#854F0B' : tone === 'alert' ? '#A32D2D' : '#1a1a1a'
  return (
    <div
      onClick={onClick}
      style={{ ...styles.metricCard, ...toneStyle, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: valueColor }}>{value}</div>
      <div style={styles.metricSub}>{sub}</div>
    </div>
  )
}

function ShortcutInterna({ to, titolo, desc }) {
  return (
    <Link to={to} style={styles.card}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{titolo}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{desc}</div>
    </Link>
  )
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  metricCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '14px 16px' },
  metricLabel: { fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 26, fontWeight: 500 },
  metricSub: { fontSize: 11, color: '#888', marginTop: 3 },
  h3: { fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 10 },
  card: {
    display: 'block', background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '14px 16px', textDecoration: 'none', cursor: 'pointer',
  },
}
