import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const MONTH_NAMES = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']

export default function GuestHome({ session }) {
  const [account, setAccount] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [bookings, setBookings] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedMember) fetchBookings() }, [selectedMember])

  async function fetchData() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    const { data: acc } = await supabase.from('accounts').select(`*, members(*, subscriptions(*, subscription_types(name)))`).eq('owner_id', session.user.id).single()
    setAccount(acc)
    setMembers(acc?.members || [])
    if (acc?.members?.length) setSelectedMember(acc.members[0].id)
    setLoading(false)
  }

  async function fetchBookings() {
    const from = new Date(today)
    const to = new Date(today)
    to.setDate(to.getDate() + 7)
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_id', selectedMember)
      .gte('date', from.toISOString().split('T')[0])
      .lte('date', to.toISOString().split('T')[0])
    setBookings(data || [])
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_id', selectedMember)
      .order('date', { ascending: false })
      .limit(20)
    setBookings(data || [])
  }

  useEffect(() => { if (selectedMember) fetchHistory() }, [selectedMember])

  const member = members.find(m => m.id === selectedMember)
  const activeSub = member?.subscriptions?.find(s => s.active)
  const rem = activeSub ? activeSub.entries_total - activeSub.entries_used : 0

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  function isBooked(date) {
    const ds = date.toISOString().split('T')[0]
    return bookings.some(b => b.date === ds && b.status !== 'cancelled')
  }

  function canCancelBooking(booking) {
    const bookingDate = new Date(booking.date)
    bookingDate.setHours(0, 0, 0, 0)
    const now = new Date()
    if (bookingDate > today) return true
    if (bookingDate.getTime() === today.getTime()) return now.getHours() < 9
    return false
  }

  async function confirmBooking() {
    if (!selectedDate || !activeSub) return
    setSaving(true)
    const ds = selectedDate.toISOString().split('T')[0]

    const { error } = await supabase.from('bookings').insert({
      member_id: selectedMember,
      account_id: account.id,
      subscription_id: activeSub.id,
      date: ds,
      status: 'booked',
    })

    if (!error) {
      await supabase.from('subscriptions').update({ entries_used: activeSub.entries_used + 1 }).eq('id', activeSub.id)
      showToast('Prenotazione confermata!')
      setSelectedDate(null)
      fetchData()
      fetchHistory()
    } else {
      showToast('Errore nella prenotazione', 'error')
    }
    setSaving(false)
  }

  async function cancelBooking(bookingId) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking || !canCancelBooking(booking)) return
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    await supabase.from('subscriptions').update({ entries_used: activeSub.entries_used - 1 }).eq('id', activeSub.id)
    showToast('Prenotazione cancellata')
    fetchData()
    fetchHistory()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function formatDate(d) {
    const date = new Date(d)
    const isToday = date.toISOString().split('T')[0] === today.toISOString().split('T')[0]
    if (isToday) return 'Oggi'
    return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Caricamento...</div>

  const historyBookings = bookings.sort((a, b) => new Date(b.date) - new Date(a.date))

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

      {/* alert ingressi esauriti */}
      {members.some(m => {
        const s = m.subscriptions?.find(sub => sub.active)
        return s && (s.entries_total - s.entries_used) <= 3
      }) && (
        <div style={styles.alertBar}>
          {members.filter(m => {
            const s = m.subscriptions?.find(sub => sub.active)
            return s && (s.entries_total - s.entries_used) <= 3
          }).map(m => {
            const s = m.subscriptions?.find(sub => sub.active)
            const rem = s.entries_total - s.entries_used
            return <div key={m.id}>{m.name} ha {rem === 0 ? 'esaurito gli ingressi' : `solo ${rem} ingresso${rem > 1 ? 'i' : ''} rimasto${rem > 1 ? 'i' : ''}`}</div>
          })}
        </div>
      )}

      {/* selezione membro */}
      {members.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={styles.sectionLabel}>Membro</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {members.map(m => (
              <button key={m.id} onClick={() => { setSelectedMember(m.id); setSelectedDate(null) }} style={{
                padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: 'none',
                background: m.id === selectedMember ? '#1a1a1a' : '#fff',
                color: m.id === selectedMember ? '#F5C842' : '#888',
                fontWeight: m.id === selectedMember ? 500 : 400,
              }}>
                {m.name}{m.id === session.user.id ? ' (tu)' : ''}
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
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 14 }}>Scegli il giorno</div>

          <div style={styles.daysGrid}>
            {days.map((d, i) => {
              const booked = isBooked(d)
              const isSelected = selectedDate?.toISOString().split('T')[0] === d.toISOString().split('T')[0]
              const isToday = i === 0
              return (
                <div
                  key={i}
                  onClick={() => !booked && setSelectedDate(new Date(d))}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '10px 4px', borderRadius: 10,
                    border: isToday && !isSelected ? '1.5px solid #1a1a1a' : '0.5px solid #eee',
                    background: isSelected ? '#F5C842' : booked ? '#EAF3DE' : '#fafafa',
                    cursor: booked ? 'default' : 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ fontSize: 10, color: isSelected ? '#1a1a1a' : booked ? '#3B6D11' : '#888' }}>{DAY_NAMES[d.getDay()]}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: isSelected ? '#1a1a1a' : booked ? '#3B6D11' : '#1a1a1a' }}>{d.getDate()}</div>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: booked ? '#3B6D11' : 'transparent' }} />
                </div>
              )
            })}
          </div>

          {selectedDate && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#888', marginBottom: 10 }}>
              Stai prenotando per <strong style={{ color: '#1a1a1a' }}>{formatDate(selectedDate)}</strong>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={styles.sectionLabel}>Prenotazioni</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {historyBookings.length === 0 && (
          <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessuna prenotazione</div>
        )}
        {historyBookings.map(b => {
          const bDate = new Date(b.date)
          bDate.setHours(0,0,0,0)
          const isFuture = bDate >= today
          const cancellable = canCancelBooking(b)
          const isActive = b.status !== 'cancelled'

          return (
            <div key={b.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', opacity: b.status === 'cancelled' ? 0.5 : 1 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{formatDate(b.date)}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{member?.name} {member?.surname}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {b.status === 'cancelled'
                  ? <span className="pill pill-gray">Cancellato</span>
                  : isFuture
                    ? <span className="pill pill-warn">Prenotato</span>
                    : <span className="pill pill-ok">Effettuato</span>
                }
                {isFuture && isActive && cancellable && (
                  <button className="btn-danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => cancelBooking(b.id)}>
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
  sectionLabel: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  subCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 },
  circle: { width: 64, height: 64, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5 },
}
