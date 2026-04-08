import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ fatturato: 0, ospiti: 0, membri: 0, oggiIngressi: 0, esaurimento: 0 })
  const [ingressi, setIngressi] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingIngressi, setLoadingIngressi] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchIngressi(selectedDate)
  }, [selectedDate])

  async function fetchStats() {
    const [{ data: subs }, { data: accounts }, { data: members }, { data: bookings }, { data: esaur }] = await Promise.all([
      supabase.from('subscriptions').select('paid_amount').eq('active', true),
      supabase.from('accounts').select('id'),
      supabase.from('members').select('id'),
      supabase.from('bookings').select('id').eq('date', today).neq('status', 'cancelled'),
      supabase.from('subscriptions').select('id').eq('active', true).lte('entries_used', 3),
    ])
    const fatturato = (subs || []).reduce((s, sub) => s + (sub.paid_amount || 0), 0)
    setStats({
      fatturato,
      ospiti: accounts?.length || 0,
      membri: members?.length || 0,
      oggiIngressi: bookings?.length || 0,
      esaurimento: esaur?.length || 0,
    })
    setLoading(false)
  }

  async function fetchIngressi(date) {
    setLoadingIngressi(true)
    const { data } = await supabase
      .from('bookings')
      .select('*, members(name, surname), accounts(name, surname)')
      .eq('date', date)
      .order('created_at', { ascending: true })
    setIngressi(data || [])
    setLoadingIngressi(false)
  }

  function labelData(date) {
    if (date === today) return 'Oggi'
    const d = new Date(date)
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  function spostaGiorno(n) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  const attivi = ingressi.filter(b => b.status !== 'cancelled')
  const cancellati = ingressi.filter(b => b.status === 'cancelled')

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Dashboard</h2>

      {/* METRICHE */}
      <div style={styles.metricsGrid}>
        <MetricCard label="Fatturato totale" value={`€ ${stats.fatturato.toLocaleString('it-IT')}`} sub="importi pagati" />
        <MetricCard label="Account attivi" value={stats.ospiti} sub="ospiti registrati" />
        <MetricCard label="Membri totali" value={stats.membri} sub={`${(stats.membri / Math.max(stats.ospiti,1)).toFixed(1)} per account`} />
        <MetricCard label="Ingressi oggi" value={stats.oggiIngressi} sub="prenotazioni attive" />
      </div>

      {/* ALERT */}
      {stats.esaurimento > 0 && (
        <div style={styles.alertBanner}>
          {stats.esaurimento} abbonament{stats.esaurimento > 1 ? 'i' : 'o'} con 3 o meno ingressi rimasti —{' '}
          <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/admin/esaurimento')}>
            visualizza
          </span>
        </div>
      )}

      {/* SELETTORE DATA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 500 }}>
          Ingressi — <span style={{ color: '#888', fontWeight: 400 }}>{labelData(selectedDate)}</span>
          {attivi.length > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: '#F5C842', fontWeight: 500 }}>{attivi.length} prenotati</span>}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => spostaGiorno(-1)}>←</button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '6px 10px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff' }}
          />
          <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => spostaGiorno(1)}>→</button>
          {selectedDate !== today && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelectedDate(today)}>Oggi</button>
          )}
        </div>
      </div>

      {loadingIngressi
        ? <div style={{ padding: 20, color: '#888', fontSize: 13 }}>Caricamento...</div>
        : ingressi.length === 0
          ? <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessuna prenotazione per questa data.</div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Membro</th>
                    <th>Account</th>
                    <th>Ora prenotazione</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {ingressi.map(b => (
                    <tr key={b.id} style={{ opacity: b.status === 'cancelled' ? 0.45 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{b.members?.name} {b.members?.surname}</td>
                      <td style={{ color: '#888', fontSize: 12 }}>{b.accounts?.name} {b.accounts?.surname}</td>
                      <td style={{ fontSize: 12, color: '#888' }}>
                        {b.created_at ? new Date(b.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <span className={`pill ${
                          b.status === 'confirmed' ? 'pill-ok' :
                          b.status === 'cancelled' ? 'pill-alert' :
                          'pill-warn'
                        }`}>
                          {b.status === 'confirmed' ? 'Confermato' :
                           b.status === 'cancelled' ? 'Cancellato' : 'Prenotato'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cancellati.length > 0 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#888', borderTop: '0.5px solid #eee' }}>
                  {cancellati.length} prenotazion{cancellati.length > 1 ? 'i' : 'e'} cancellat{cancellati.length > 1 ? 'e' : 'a'}
                </div>
              )}
            </div>
          )
      }
    </div>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricSub}>{sub}</div>
    </div>
  )
}

const styles = {
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 20 },
  metricCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '14px 16px' },
  metricLabel: { fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 26, fontWeight: 500 },
  metricSub: { fontSize: 11, color: '#888', marginTop: 3 },
  alertBanner: { background: '#FAEEDA', color: '#854F0B', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 20 },
}
