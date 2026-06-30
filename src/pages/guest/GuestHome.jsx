import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const MONTH_NAMES = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']

function toLocalDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromDateString(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Seleziona il sub da mostrare in UI per un membro con potenzialmente
// piu' sub attivi (caso reale: vecchio esaurito + nuovo con ingressi).
// Regola:
//   - tra gli attivi con ingressi disponibili → il PIU' ANZIANO (FIFO)
//   - se tutti gli attivi sono esauriti → il PIU' RECENTE (fallback,
//     per mantenere il display "0 rimasti" coerente col passato)
//   - se nessun attivo → null
function pickActiveSub(subs) {
  if (!subs?.length) return null
  const actives = subs.filter(s => s.active)
  if (!actives.length) return null
  const withRemaining = actives
    .filter(s => s.entries_used < s.entries_total)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  if (withRemaining.length > 0) return withRemaining[0]
  // tutti esauriti → mostra il piu' recente
  return [...actives].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
}

// Somma ingressi rimasti su TUTTI i sub attivi del membro. Usato per
// l'alertBar di esaurimento: "esaurito" = totale 0, "in esaurimento"
// = totale <= 3.
function totalRemainingForMember(m) {
  return (m.subscriptions || [])
    .filter(s => s.active)
    .reduce((sum, s) => sum + Math.max(0, s.entries_total - s.entries_used), 0)
}

export default function GuestHome({ session }) {
  const [account, setAccount] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [bookings, setBookings] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  // Walk-in registrati dall'admin con notifica_da_mostrare=true.
  // Mostrati in banner non-bloccante in cima alla home.
  const [walkinPending, setWalkinPending] = useState([])
  // Map { 'YYYY-MM-DD': wmo_code } per i prossimi 7 giorni (Open-Meteo).
  // Vuoto se l'API meteo non risponde — l'emoji semplicemente non appare.
  const [weatherByDate, setWeatherByDate] = useState({})

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateString(today)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() + weekOffset * 7)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return toLocalDateString(d)
  })

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedMember) fetchHistory() }, [selectedMember])
  // Banner walk-in: fetch separato che dipende da account.id (post-fetchData).
  useEffect(() => { if (account?.id) fetchWalkinPending() }, [account?.id])
  // Meteo Arezzo: 1 sola chiamata al mount, no re-fetch al cambio data.
  useEffect(() => { fetchWeatherForecast() }, [])

  async function fetchData() {
    await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    const { data: acc } = await supabase
      .from('accounts')
      .select(`*, members(*, subscriptions(*, subscription_types(name)))`)
      .eq('owner_id', session.user.id)
      .single()
    setAccount(acc)
    setMembers(acc?.members || [])
    if (acc?.members?.length) setSelectedMember(acc.members[0].id)
    setLoading(false)
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_id', selectedMember)
      .order('date', { ascending: false })
      .limit(50)
    setBookings(data || [])
  }

  // Walk-in con notifica pendente per l'intero account (tutti i membri della famiglia).
  async function fetchWalkinPending() {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, date')
      .eq('account_id', account.id)
      .eq('source', 'admin_walkin')
      .eq('notifica_da_mostrare', true)
      .order('date', { ascending: false })
    if (error) console.error('[GuestHome.fetchWalkinPending]', error)
    setWalkinPending(data || [])
  }

  // Dismiss banner: UPDATE batch notifica_da_mostrare=false su tutti gli ID pendenti.
  // Il trigger lock_walkin_columns permette al guest SOLO la transizione true→false:
  // il banner non puo' riapparire dopo il dismiss.
  async function dismissWalkinNotifications() {
    if (!walkinPending.length) return
    const ids = walkinPending.map(b => b.id)
    const { error } = await supabase
      .from('bookings')
      .update({ notifica_da_mostrare: false })
      .in('id', ids)
    if (error) {
      console.error('[GuestHome.dismissWalkinNotifications]', error)
      showToast('Errore nel chiudere la notifica', 'error')
      return
    }
    setWalkinPending([])
  }

  // Open-Meteo: API gratuita senza key. Coordinate Arezzo, daily weather_code,
  // 7 giorni. Errori silenziosi — il meteo e' "nice to have", non blocca nulla.
  async function fetchWeatherForecast() {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast'
        + '?latitude=43.46&longitude=11.88'
        + '&daily=weather_code&forecast_days=7'
        + '&timezone=Europe%2FRome'
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const times = data?.daily?.time || []
      const codes = data?.daily?.weather_code || []
      const map = {}
      for (let i = 0; i < times.length; i++) map[times[i]] = codes[i]
      setWeatherByDate(map)
    } catch (_) {
      // silenzio voluto
    }
  }

  const member = members.find(m => m.id === selectedMember)
  const activeSub = pickActiveSub(member?.subscriptions)
  const rem = activeSub ? activeSub.entries_total - activeSub.entries_used : 0

  function isBooked(dateStr) {
    return bookings.some(b => b.date === dateStr && b.status !== 'cancelled')
  }

  function canCancelBooking(booking) {
    const bDate = fromDateString(booking.date)
    const now = new Date()
    if (bDate > today) return true
    if (bDate.getTime() === today.getTime()) return now.getHours() < 9
    return false
  }

  async function confirmBooking() {
    if (!selectedDate || !activeSub) return
    setSaving(true)

    const { data: newBooking, error } = await supabase.from('bookings').insert({
      member_id: selectedMember,
      // bookings.head_member_id e' NOT NULL dalla migration 20260525120000.
      // Nel flusso attuale "uno-booking-per-membro" coincide col booker; verra'
      // ripensato in Fase 2 col modello "una prenotazione per nucleo".
      head_member_id: selectedMember,
      account_id: account.id,
      subscription_id: activeSub.id,
      date: selectedDate,
      status: 'booked',
    }).select().single()

    if (!error && newBooking) {
      await supabase.from('subscriptions')
        .update({ entries_used: activeSub.entries_used + 1 })
        .eq('id', activeSub.id)
      setBookings(prev => [newBooking, ...prev])
      showToast('Prenotazione confermata!')
      setSelectedDate(null)
      fetchData()
    } else {
      showToast('Errore nella prenotazione', 'error')
    }
    setSaving(false)
  }

  async function cancelBooking(bookingId) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking || !canCancelBooking(booking)) return

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    await supabase.from('subscriptions')
      .update({ entries_used: activeSub.entries_used - 1 })
      .eq('id', activeSub.id)

    // Aggiorna subito locale — non chiamare fetchHistory() per non sovrascrivere
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    showToast('Prenotazione cancellata')
    fetchData()
  }

  async function reactivateBooking(bookingId) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return

    await supabase.from('bookings').update({ status: 'booked' }).eq('id', bookingId)
    await supabase.from('subscriptions')
      .update({ entries_used: activeSub.entries_used + 1 })
      .eq('id', activeSub.id)

    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'booked' } : b))
    showToast('Prenotazione riattivata!')
    fetchData()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Formatta data ISO 'YYYY-MM-DD' in 'GG/MM/AAAA' per il banner walk-in.
  function fmtDateIt(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  // Concatena N date in stringa italiana:
  //   1: "12/06/2026"
  //   2: "11/06/2026 e 12/06/2026"
  //   3+: "10/06/2026, 11/06/2026 e 12/06/2026"
  function joinDatesIt(items) {
    if (items.length === 0) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} e ${items[1]}`
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
  }

  // Mappa WMO weather code → emoji. Ritorna null per codici sconosciuti
  // o quando il code e' undefined (es. data fuori dai 7 giorni di forecast,
  // o map vuoto perche' l'API meteo non ha risposto).
  function weatherEmoji(code) {
    if (code === undefined || code === null) return null
    if (code === 0 || code === 1) return '☀️'
    // 'overcast' (3) ammorbidito a '⛅' invece di '☁️': per Arezzo l'overcast
    // estivo e' spesso alto-luminoso, non drammatico. Scelta opinata.
    if (code === 2 || code === 3) return '⛅'
    if (code === 45 || code === 48) return '🌫️'
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️'
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️'
    if (code === 95 || code === 96 || code === 99) return '⛈️'
    return null
  }

  function formatDate(dateStr) {
    const d = fromDateString(dateStr)
    if (dateStr === todayStr) return 'Oggi'
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
  }

  function weekLabel() {
    const first = fromDateString(days[0])
    const last = fromDateString(days[6])
    if (weekOffset === 0) return 'Questa settimana'
    if (weekOffset === 1) return 'Prossima settimana'
    return `${first.getDate()} ${MONTH_NAMES[first.getMonth()]} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()]}`
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Caricamento...</div>

  const historyBookings = [...bookings].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* hero */}
      <div style={styles.hero}>
        <div>
          <div style={{ color: '#aaa', fontSize: 12 }}>Benvenuto,</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 500, marginTop: 2 }}>{account?.name} {account?.surname}</div>
          <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
            {account?.type === 'family' ? 'Account familiare' : 'Account singolo'}
          </div>
        </div>
        {account?.type === 'family' && (
          <div style={styles.yellowPill}>{members.length} membri</div>
        )}
      </div>

      {/* banner walk-in registrati dalla direzione (non-bloccante, dismissibile) */}
      {walkinPending.length > 0 && (
        <div style={styles.walkinBanner}>
          <div style={{ flex: 1 }}>
            {walkinPending.length === 1
              ? <>La direzione ha registrato un tuo ingresso del <strong>{fmtDateIt(walkinPending[0].date)}</strong> non prenotato</>
              : <>La direzione ha registrato <strong>{walkinPending.length}</strong> tuoi ingressi non prenotati: <strong>{joinDatesIt(walkinPending.map(b => fmtDateIt(b.date)))}</strong></>
            }
          </div>
          <button
            onClick={dismissWalkinNotifications}
            style={styles.walkinDismiss}
            aria-label="Chiudi notifica"
          >✕</button>
        </div>
      )}

      {/* alert ingressi in esaurimento — somma totale sui sub attivi del membro,
          non sul singolo sub mostrato (un membro con vecchio esaurito + nuovo pieno
          NON e' in esaurimento). */}
      {members.some(m =>
        (m.subscriptions || []).some(s => s.active) &&
        totalRemainingForMember(m) <= 3
      ) && (
        <div style={styles.alertBar}>
          {members
            .filter(m =>
              (m.subscriptions || []).some(s => s.active) &&
              totalRemainingForMember(m) <= 3
            )
            .map(m => {
              const totalRem = totalRemainingForMember(m)
              return (
                <div key={m.id}>
                  {m.name} ha {totalRem === 0
                    ? 'esaurito gli ingressi'
                    : `solo ${totalRem} ingress${totalRem === 1 ? 'o' : 'i'} rimast${totalRem === 1 ? 'o' : 'i'}`}
                </div>
              )
            })}
        </div>
      )}

      {/* selezione membro */}
      {members.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={styles.sectionLabel}>Membro</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => { setSelectedMember(m.id); setSelectedDate(null) }}
                style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: 'none',
                  background: m.id === selectedMember ? '#1a1a1a' : '#fff',
                  color: m.id === selectedMember ? '#F5C842' : '#888',
                  fontWeight: m.id === selectedMember ? 500 : 400,
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* card ingressi */}
      {activeSub && (
        <div style={styles.subCard}>
          <div style={{ ...styles.circle, background: rem <= 3 ? '#FCEBEB' : '#F5C842' }}>
            <div style={{ fontSize: 26, fontWeight: 500, color: rem <= 3 ? '#A32D2D' : '#1a1a1a', lineHeight: 1 }}>{rem}</div>
            <div style={{ fontSize: 10, color: rem <= 3 ? '#A32D2D' : '#1a1a1a', opacity: 0.7 }}>rimasti</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>Coworking + Piscina</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
              {activeSub.entries_used} usati su {activeSub.entries_total}
            </div>
            <div className="progress" style={{ marginTop: 10 }}>
              <div className="progress-fill" style={{
                width: `${Math.round((activeSub.entries_used / activeSub.entries_total) * 100)}%`,
                background: rem <= 3 ? '#E24B4A' : '#F5C842',
              }} />
            </div>
          </div>
        </div>
      )}

      {!activeSub && (
        <div style={{ background: '#FCEBEB', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13, color: '#A32D2D' }}>
          Nessun abbonamento attivo. Contatta la reception ASC Hotel.
        </div>
      )}

      {/* prenotazione */}
      {activeSub && rem > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Scegli il giorno</div>

          {/* navigazione settimane */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={() => { setWeekOffset(w => Math.max(0, w - 1)); setSelectedDate(null) }}
              disabled={weekOffset === 0}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '0.5px solid #ddd',
                background: weekOffset === 0 ? '#f5f5f3' : '#fff',
                color: weekOffset === 0 ? '#ccc' : '#1a1a1a',
                fontSize: 16, cursor: weekOffset === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
            <span style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{weekLabel()}</span>
            <button
              onClick={() => { setWeekOffset(w => w + 1); setSelectedDate(null) }}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '0.5px solid #ddd', background: '#fff',
                color: '#1a1a1a', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          </div>

          <div style={styles.daysGrid}>
            {days.map((dateStr, i) => {
              const d = fromDateString(dateStr)
              const booked = isBooked(dateStr)
              const isSelected = selectedDate === dateStr
              const isToday = dateStr === todayStr
              const isPast = dateStr < todayStr
              return (
                <div
                  key={dateStr}
                  onClick={() => !booked && !isPast && setSelectedDate(dateStr)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '10px 4px', borderRadius: 10,
                    border: isToday && !isSelected ? '1.5px solid #1a1a1a' : '0.5px solid #eee',
                    background: isSelected ? '#F5C842' : booked ? '#EAF3DE' : '#fafafa',
                    cursor: booked || isPast ? 'default' : 'pointer',
                    opacity: isPast ? 0.4 : 1,
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ fontSize: 10, color: isSelected ? '#1a1a1a' : booked ? '#3B6D11' : '#888' }}>
                    {DAY_NAMES[d.getDay()]}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: isSelected ? '#1a1a1a' : booked ? '#3B6D11' : '#1a1a1a' }}>
                    {d.getDate()}
                  </div>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: booked ? '#3B6D11' : 'transparent' }} />
                </div>
              )
            })}
          </div>

          {selectedDate && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#888', marginBottom: 10 }}>
              Stai prenotando per <strong style={{ color: '#1a1a1a' }}>{formatDate(selectedDate)}</strong>
              {weatherEmoji(weatherByDate[selectedDate]) && (
                <span style={{ marginLeft: 6 }}>{weatherEmoji(weatherByDate[selectedDate])}</span>
              )}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ width: '100%', marginTop: 4, opacity: !selectedDate ? 0.5 : 1 }}
            disabled={!selectedDate || saving}
            onClick={confirmBooking}
          >
            {saving ? 'Confermando...' : selectedDate ? `Conferma — ${formatDate(selectedDate)}` : 'Seleziona un giorno'}
          </button>

          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 8 }}>
            Cancellazione gratuita entro le 9:00 del giorno stesso
          </div>
        </div>
      )}

      {/* storico */}
      <div style={{ marginBottom: 10 }}>
        <div style={styles.sectionLabel}>Prenotazioni</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {historyBookings.length === 0 && (
          <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessuna prenotazione</div>
        )}
        {historyBookings.map(b => {
          const isFuture = b.date >= todayStr
          const cancellable = canCancelBooking(b)
          const isActive = b.status !== 'cancelled'

          return (
            <div
              key={b.id}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', opacity: b.status === 'cancelled' ? 0.6 : 1,
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{formatDate(b.date)}</div>
                {b.source === 'admin_walkin' && (
                  <span style={styles.walkinBadge}>registrato dalla direzione</span>
                )}
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{member?.name} {member?.surname}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {b.status === 'cancelled'
                  ? <span className="pill pill-gray">Cancellato</span>
                  : isFuture
                    ? <span className="pill pill-warn">Prenotato</span>
                    : <span className="pill pill-ok">Effettuato</span>
                }
                {/* Riattiva — solo per prenotazioni future cancellate */}
                {b.status === 'cancelled' && isFuture && (
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => reactivateBooking(b.id)}
                  >
                    Riattiva
                  </button>
                )}
                {/* Cancella */}
                {isFuture && isActive && cancellable && (
                  <button
                    className="btn-danger"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => cancelBooking(b.id)}
                  >
                    Cancella
                  </button>
                )}
                {isFuture && isActive && !cancellable && (
                  <span style={{ fontSize: 11, color: '#A32D2D' }}>Non cancellabile</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  hero: { background: '#1a1a1a', borderRadius: 16, padding: '20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  yellowPill: { background: '#F5C842', color: '#1a1a1a', fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  alertBar: { background: '#FAEEDA', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#854F0B', marginBottom: 14 },
  walkinBanner: { background: '#FAEEDA', borderLeft: '3px solid #BA7517', borderRadius: '0 10px 10px 0', padding: '10px 14px', fontSize: 13, color: '#854F0B', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 },
  walkinDismiss: { background: 'transparent', border: 'none', color: '#854F0B', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 },
  walkinBadge: { display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#FAEEDA', color: '#854F0B', fontWeight: 500, marginTop: 4, marginBottom: 2, whiteSpace: 'nowrap' },
  sectionLabel: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  subCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 },
  circle: { width: 64, height: 64, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5 },
}
