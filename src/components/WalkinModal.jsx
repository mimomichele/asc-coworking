// ============================================================
// WalkinModal — admin registra un ingresso "walk-in" per un
// ospite che NON ha prenotato online.
//
// Flusso:
//   1. cerca ospite (digita >= 1 char)
//   2. selezionato l'account: se ha 1 solo membro auto-pick,
//      altrimenti dropdown membri
//   3. selezionato il membro: se ha 1 sub attiva auto-pick,
//      altrimenti dropdown abbonamenti
//   4. data (default oggi, max oggi — no walk-in nel futuro)
//   5. live check: se esiste gia' un ingresso (booked/confirmed)
//      per (member_id, date) blocca Conferma
//   6. Conferma → RPC register_walkin_entry (transazione atomica
//      lato DB) → onSuccess(messaggio) → onClose()
//
// Props:
//   accounts: array (preso da Ospiti.jsx; deve includere
//             members.subscriptions con campo `id`)
//   onClose: () => void
//   onSuccess: (msg: string) => void
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

function todayIso() {
  // Data odierna in formato YYYY-MM-DD nel timezone locale del browser.
  // Coerente col check server-side che usa Europe/Rome — l'admin opera
  // sempre dall'Italia, quindi nessuna divergenza pratica.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtDateIt(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function WalkinModal({ accounts, onClose, onSuccess }) {
  const today = useMemo(() => todayIso(), [])

  const [search, setSearch] = useState('')
  const [accountId, setAccountId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [date, setDate] = useState(today)
  const [existing, setExisting] = useState([])    // bookings esistenti su (member,date)
  const [checking, setChecking] = useState(false) // query live in corso
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Risultati ricerca: solo account attivi. Limito a 8 per non sovraffollare.
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return []
    return accounts
      .filter(a => a.attivo !== false)
      .filter(a => {
        const tit = `${a.name} ${a.surname}`.toLowerCase()
        if (tit.includes(q)) return true
        if (a.phone?.includes(q)) return true
        return (a.members || []).some(m =>
          `${m.name} ${m.surname}`.toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [accounts, search])

  const selectedAccount = accountId ? accounts.find(a => a.id === accountId) : null
  const members = selectedAccount?.members || []
  const selectedMember = memberId ? members.find(m => m.id === memberId) : null
  const activeSubs = selectedMember
    ? (selectedMember.subscriptions || []).filter(s => s.active)
    : []
  const selectedSub = subscriptionId
    ? activeSubs.find(s => s.id === subscriptionId)
    : null

  // Auto-pick membro se l'account ne ha uno solo.
  useEffect(() => {
    if (!selectedAccount) { setMemberId(''); setSubscriptionId(''); return }
    if (members.length === 1) setMemberId(members[0].id)
    else setMemberId('')
    setSubscriptionId('')
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick abbonamento se il membro ne ha uno solo attivo.
  useEffect(() => {
    if (!selectedMember) { setSubscriptionId(''); return }
    if (activeSubs.length === 1) setSubscriptionId(activeSubs[0].id)
    else setSubscriptionId('')
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live check: esiste gia' un ingresso (booked/confirmed) per (member, date)?
  // Cancello sul refetch successivo (race protection con StrictMode).
  useEffect(() => {
    if (!memberId || !date) { setExisting([]); return }
    let cancelled = false
    setChecking(true)
    ;(async () => {
      const { data, error: err } = await supabase
        .from('bookings')
        .select('id, source')
        .eq('member_id', memberId)
        .eq('date', date)
        .in('status', ['booked', 'confirmed'])
      if (cancelled) return
      if (err) console.error('[WalkinModal.checkExisting]', err)
      setExisting(data || [])
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [memberId, date])

  // Calcolo motivo di blocco (in priorita'). Il primo che matcha vince.
  let blockReason = ''
  if (selectedAccount) {
    if (members.length > 1 && !selectedMember) blockReason = 'Seleziona il membro'
    else if (selectedMember) {
      if (activeSubs.length === 0) blockReason = 'Nessun abbonamento attivo per questo ospite'
      else if (activeSubs.length > 1 && !selectedSub) blockReason = "Seleziona l'abbonamento"
      else if (selectedSub && selectedSub.entries_used >= selectedSub.entries_total)
        blockReason = 'Abbonamento esaurito, crearne uno nuovo prima'
      else if (date > today) blockReason = 'La data non puo\' essere nel futuro'
      else if (existing.length > 0) blockReason = 'Esiste gia\' un ingresso per questo giorno'
    }
  }

  const canSubmit =
    !!selectedAccount && !!selectedMember && !!selectedSub && !!date &&
    !blockReason && !checking && !submitting

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    const { error: err } = await supabase.rpc('register_walkin_entry', {
      p_account_id: accountId,
      p_member_id: memberId,
      p_subscription_id: subscriptionId,
      p_date: date,
    })
    setSubmitting(false)
    if (err) {
      console.error('[WalkinModal.submit]', err)
      const msg = err.message || ''
      // 23505 = unique_violation sull'index uniq_member_date_active
      // (race fra UI check e INSERT: qualcun altro ha appena creato).
      if (err.code === '23505' || msg.includes('uniq_member_date_active')) {
        setError('Esiste gia\' un ingresso per questo giorno')
      } else if (msg.includes('not_admin')) {
        setError('Solo gli admin possono registrare ingressi walk-in')
      } else if (msg.includes('future_date')) {
        setError('La data non puo\' essere nel futuro')
      } else if (msg.includes('sub_not_found')) {
        setError('Abbonamento non trovato')
      } else if (msg.includes('sub_not_active')) {
        setError('Abbonamento disattivato')
      } else if (msg.includes('sub_exhausted')) {
        setError('Abbonamento esaurito')
      } else {
        setError('Errore: ' + msg)
      }
      return
    }
    const who = `${selectedAccount.name} ${selectedAccount.surname}`
    onSuccess(`Ingresso del ${fmtDateIt(date)} registrato per ${who}`)
  }

  function resetSelection() {
    setAccountId('')
    setMemberId('')
    setSubscriptionId('')
    setSearch('')
    setError('')
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <h3 style={S.title}>Registra ingresso walk-in</h3>
          <button onClick={onClose} style={S.closeBtn} aria-label="Chiudi">✕</button>
        </div>

        {!selectedAccount && (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={S.lbl}>Cerca ospite</label>
              <input
                autoFocus
                placeholder="Nome, cognome, telefono…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={S.inp}
              />
            </div>
            {filtered.length > 0 && (
              <div style={S.resList}>
                {filtered.map(a => (
                  <div key={a.id} onClick={() => setAccountId(a.id)} style={S.resRow}>
                    <div style={{ fontWeight: 500 }}>{a.name} {a.surname}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {a.phone || '—'} · {a.type === 'family' ? 'Familiare' : 'Singolo'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {search && filtered.length === 0 && (
              <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>
                Nessun ospite attivo corrisponde alla ricerca
              </div>
            )}
          </>
        )}

        {selectedAccount && (
          <>
            <div style={S.selBox}>
              <div>
                <div style={{ fontWeight: 500 }}>{selectedAccount.name} {selectedAccount.surname}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {selectedAccount.phone || '—'} · {selectedAccount.type === 'family' ? 'Familiare' : 'Singolo'}
                </div>
              </div>
              <button onClick={resetSelection} style={S.changeBtn}>Cambia</button>
            </div>

            {members.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.lbl}>Membro</label>
                <select value={memberId} onChange={e => setMemberId(e.target.value)} style={S.inp}>
                  <option value="">Seleziona…</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name} {m.surname}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedMember && activeSubs.length === 0 && (
              <div style={S.errBox}>Nessun abbonamento attivo per questo ospite</div>
            )}

            {selectedMember && activeSubs.length === 1 && (
              <div style={S.subBox}>
                <div style={{ fontSize: 12, color: '#888' }}>Abbonamento</div>
                <div style={{ fontWeight: 500 }}>
                  {activeSubs[0].entries_total - activeSubs[0].entries_used}/{activeSubs[0].entries_total} ingressi rimasti
                </div>
              </div>
            )}

            {selectedMember && activeSubs.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.lbl}>Abbonamento</label>
                <select
                  value={subscriptionId}
                  onChange={e => setSubscriptionId(e.target.value)}
                  style={S.inp}
                >
                  <option value="">Seleziona…</option>
                  {activeSubs.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.entries_total - s.entries_used}/{s.entries_total} ingressi rimasti
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedMember && activeSubs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.lbl}>Data dell'ingresso</label>
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={e => setDate(e.target.value)}
                  style={S.inp}
                />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Default: oggi. Puoi scegliere qualsiasi data passata.
                </div>
              </div>
            )}

            {blockReason && !error && (
              <div style={S.errBox}>{blockReason}</div>
            )}
            {error && (
              <div style={S.errBox}>{error}</div>
            )}

            <div style={S.actions}>
              <button onClick={onClose} className="btn-ghost" disabled={submitting}>
                Annulla
              </button>
              <button
                onClick={handleSubmit}
                className="btn-primary"
                disabled={!canSubmit}
                style={{ opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
              >
                {submitting ? 'Registrazione…' : 'Conferma'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: 24,
    width: 'min(520px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 500, margin: 0 },
  closeBtn: {
    background: 'transparent', border: 'none', fontSize: 20, color: '#888',
    cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  lbl: { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 },
  inp: {
    width: '100%', padding: '9px 12px', border: '0.5px solid #ccc',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
    background: '#fff', color: '#1a1a1a', outline: 'none',
  },
  resList: {
    maxHeight: 280, overflowY: 'auto',
    border: '0.5px solid #eee', borderRadius: 8,
  },
  resRow: {
    padding: '10px 12px', borderBottom: '0.5px solid #eee', cursor: 'pointer',
  },
  selBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, background: '#FAEEDA', borderRadius: 8, marginBottom: 14,
  },
  changeBtn: {
    background: 'transparent', border: 'none', color: '#854F0B',
    fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
  },
  subBox: {
    padding: 10, background: '#f7f7f5', borderRadius: 8, marginBottom: 12,
  },
  errBox: {
    padding: 10, background: '#FEEEEE', color: '#A23B3A',
    borderRadius: 8, fontSize: 13, marginBottom: 10,
  },
  actions: {
    display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end',
  },
}
