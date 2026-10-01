import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Dashboard invernale (da ottobre 2026): il lavoro quotidiano sono le
// app operative — Manutenzione, Pulizie, Colazioni, Honesty, Ristorante —
// quindi stanno in cima, a un click, senza passare da "Le mie app".
// Coworking e bagnini sono in pausa fino all'estate: vivono in un blocco
// in fondo, coi loro numeri caricati solo quando lo si apre.
//
// La pagina si disegna SUBITO: niente schermata "Caricamento..." che
// blocca tutto per cinque query di una sezione in pausa. L'unica query
// a caldo è quella delle richieste turni (un badge che riguarda l'oggi).

const APP_QUOTIDIANE = [
  { emoji: '🔧', label: 'Manutenzione', url: 'https://hotel-manutenzione.vercel.app', desc: 'Guasti e interventi' },
  { emoji: '🧹', label: 'Pulizie', url: 'https://asc-housekeeping.vercel.app/reception', desc: 'Programma camere e biancheria' },
  { emoji: '🥐', label: 'Colazioni', url: 'https://hotel-colazioni.vercel.app', desc: 'Colazioni e presenze' },
  { emoji: '🍹', label: 'Honesty Bar', url: 'https://asc-honesty-bar.vercel.app/admin', desc: 'Addebiti e incassi' },
  { emoji: '🍽️', label: 'Ristorante', url: 'https://ristorante.aschotel.com', desc: 'Gestionale ristorante' },
]

export default function DashboardHome() {
  const navigate = useNavigate()
  const [richieste, setRichieste] = useState(0)
  const [pausaAperta, setPausaAperta] = useState(false)
  const [pausa, setPausa] = useState(null) // metriche coworking, caricate all'apertura

  useEffect(() => {
    // il solo numero che riguarda l'oggi: richieste turni dei dipendenti
    Promise.all([
      supabase.from('shift_change_requests').select('id', { count: 'exact', head: true }).eq('stato', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('stato', 'pending'),
    ]).then(([scr, leave]) => setRichieste((scr.count || 0) + (leave.count || 0)))
      .catch(() => {})
  }, [])

  async function apriPausa() {
    const apertura = !pausaAperta
    setPausaAperta(apertura)
    if (!apertura || pausa) return
    // giorno locale, mai toISOString (regola ASC-DESIGN)
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    try {
      const [accounts, subs, bookings] = await Promise.all([
        supabase.from('accounts').select('id, attivo'),
        supabase.from('subscriptions').select('entries_total, entries_used').eq('active', true),
        supabase.from('bookings').select('id').eq('date', today).neq('status', 'cancelled'),
      ])
      setPausa({
        ospiti: (accounts.data || []).filter(a => a.attivo !== false).length,
        esaurimento: (subs.data || []).filter(s => (s.entries_total - s.entries_used) <= 3).length,
        prenotazioniOggi: (bookings.data || []).length,
      })
    } catch { setPausa({ ospiti: '—', esaurimento: '—', prenotazioniOggi: '—' }) }
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Dashboard</h2>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>L'operativo di ogni giorno, a un click</div>

      {richieste > 0 && (
        <div onClick={() => navigate('/admin/turni/richieste')} style={styles.alert}>
          🔔 {richieste} {richieste === 1 ? 'richiesta turni in attesa' : 'richieste turni in attesa'} di approvazione — tocca per aprirle
        </div>
      )}

      {/* APP DI OGNI GIORNO — esterne, nuova scheda */}
      <h3 style={styles.h3}>Ogni giorno</h3>
      <div style={styles.gridApp}>
        {APP_QUOTIDIANE.map(a => (
          <a key={a.label} href={a.url} target="_blank" rel="noopener noreferrer" style={styles.appCard}>
            <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{a.emoji}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111111' }}>
                {a.label} <span aria-hidden="true" style={{ fontSize: 12, opacity: 0.5 }}>↗</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>{a.desc}</div>
            </div>
          </a>
        ))}
      </div>

      {/* SEZIONI INTERNE ATTIVE */}
      <h3 style={styles.h3}>Sezioni</h3>
      <div style={styles.grid}>
        <ShortcutInterna to="/admin/turni" titolo="Turni" desc="Planner, richieste, report ore" badge={richieste || null} />
        <ShortcutInterna to="/admin/rosticceria" titolo="Rosticceria" desc="Ordini, produzione, menù" />
        <ShortcutInterna to="/admin/le-mie-app" titolo="Le mie app" desc="Tutte le app esterne dell'hotel" />
      </div>

      {/* IN PAUSA FINO ALL'ESTATE */}
      <div style={styles.pausaCard}>
        <div onClick={apriPausa} style={styles.pausaHeader}>
          <span style={{ color: '#6B6B6B', width: 12 }}>{pausaAperta ? '▾' : '▸'}</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>❄️ In pausa fino all'estate</span>
          <span style={{ fontSize: 12, color: '#6B6B6B' }}>Coworking e piscina · Turni bagnini</span>
        </div>
        {pausaAperta && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={styles.grid}>
              <Metric label="Ospiti attivi" value={pausa ? pausa.ospiti : '…'} sub="account abilitati" />
              <Metric label="In esaurimento" value={pausa ? pausa.esaurimento : '…'} sub="≤ 3 ingressi rimasti" />
              <Metric label="Prenotazioni oggi" value={pausa ? pausa.prenotazioniOggi : '…'} sub="coworking / piscina" />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/admin/coworking" style={styles.pausaLink}>Apri la sezione Coworking</Link>
              <a href="https://turni-bagnini.vercel.app" target="_blank" rel="noopener noreferrer" style={styles.pausaLink}>🛟 Turni Bagnini ↗</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, sub }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricSub}>{sub}</div>
    </div>
  )
}

function ShortcutInterna({ to, titolo, desc, badge }) {
  return (
    <Link to={to} style={styles.card}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#111111', display: 'flex', alignItems: 'center', gap: 8 }}>
        {titolo}
        {badge ? <span style={styles.badge}>{badge}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 3 }}>{desc}</div>
    </Link>
  )
}

const styles = {
  gridApp: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 },
  appCard: {
    display: 'flex', alignItems: 'center', gap: 14, background: '#fff',
    border: '0.5px solid #E5E3DC', borderRadius: 12, padding: '18px 16px',
    textDecoration: 'none', minHeight: 44,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  metricCard: { background: '#fff', border: '0.5px solid #E5E3DC', borderRadius: 12, padding: '14px 16px' },
  metricLabel: { fontSize: 11, color: '#6B6B6B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 26, fontWeight: 700, color: '#111111' },
  metricSub: { fontSize: 11, color: '#6B6B6B', marginTop: 3 },
  h3: { fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 10 },
  alert: {
    background: '#FCEBEB', border: '0.5px solid #F2C9C9', borderRadius: 10,
    padding: '12px 16px', fontSize: 13.5, color: '#C5221F', fontWeight: 500,
    marginBottom: 16, cursor: 'pointer',
  },
  badge: {
    background: '#C5221F', color: '#fff', borderRadius: 10, fontSize: 11,
    fontWeight: 700, padding: '1px 7px',
  },
  card: {
    display: 'block', background: '#fff', border: '0.5px solid #E5E3DC', borderRadius: 12,
    padding: '14px 16px', textDecoration: 'none', cursor: 'pointer',
  },
  pausaCard: { background: '#FAFAF7', border: '0.5px solid #E5E3DC', borderRadius: 12, overflow: 'hidden' },
  pausaHeader: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
    cursor: 'pointer', userSelect: 'none', minHeight: 44,
  },
  pausaLink: {
    display: 'inline-flex', alignItems: 'center', minHeight: 38, padding: '0 14px',
    border: '0.5px solid #E5E3DC', borderRadius: 10, background: '#fff',
    color: '#111111', fontSize: 13, fontWeight: 600, textDecoration: 'none',
  },
}
