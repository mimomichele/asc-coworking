// ============================================================
// Esauriti — lista membri con sub esaurita (entries_used >=
// entries_total) per follow-up telefonico rinnovo. Tracciamo
// l'esito (rinnova / non rinnova) per non ricontattare due
// volte la stessa persona.
//
// 2 sezioni:
//  1. Da contattare — pending, ordinata per data esaurimento ASC
//  2. Gia' contattati — collassabile, default chiusa
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const EMBED = `
  id, entries_total, entries_used, created_at,
  follow_up_status, follow_up_date,
  members ( id, name, surname, account_id,
    accounts ( id, name, surname )
  ),
  subscription_types ( name )
`

function fmtDateIt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTimeIt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Esauriti() {
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [contacted, setContacted] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    // Round 1: 2 query parallele
    // - pendenti: solo active+entries_total>0; filtro entries_used>=entries_total client-side
    //   (supabase non confronta 2 colonne via REST)
    // - gia' contattati: storico indipendent da active/entries
    const [pendingRes, contactedRes] = await Promise.all([
      supabase.from('subscriptions')
        .select(EMBED)
        .eq('active', true)
        .eq('follow_up_status', 'pending')
        .gt('entries_total', 0),
      supabase.from('subscriptions')
        .select(EMBED)
        .in('follow_up_status', ['no_renewal', 'renewed'])
        .order('follow_up_date', { ascending: false }),
    ])
    if (pendingRes.error) console.error('[Esauriti.pending]', pendingRes.error)
    if (contactedRes.error) console.error('[Esauriti.contacted]', contactedRes.error)

    const pendingFiltered = (pendingRes.data || [])
      .filter(s => s.entries_used >= s.entries_total)

    // Round 2: bookings per calcolare MAX(date) = data esaurimento.
    const allIds = [
      ...pendingFiltered.map(s => s.id),
      ...((contactedRes.data || []).map(s => s.id)),
    ]
    const maxDateBySub = {}
    if (allIds.length > 0) {
      const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('subscription_id, date')
        .in('subscription_id', allIds)
        .in('status', ['booked', 'confirmed'])
      if (bErr) console.error('[Esauriti.bookings]', bErr)
      for (const b of (bookings || [])) {
        if (!maxDateBySub[b.subscription_id] || b.date > maxDateBySub[b.subscription_id]) {
          maxDateBySub[b.subscription_id] = b.date
        }
      }
    }

    // Fallback: se nessun booking, usa created_at del sub (caso teorico raro).
    const augment = s => ({
      ...s,
      esaurimento: maxDateBySub[s.id] || (s.created_at ? s.created_at.slice(0, 10) : null),
    })

    setPending(pendingFiltered.map(augment))
    setContacted((contactedRes.data || []).map(augment))
    setLoading(false)
  }

  // Pending ordinati per data esaurimento ASC (piu' vecchi/urgenti in cima)
  const pendingSorted = useMemo(() =>
    [...pending].sort((a, b) => (a.esaurimento || '').localeCompare(b.esaurimento || '')),
    [pending])

  async function updateFollowUp(subId, newStatus) {
    const payload = newStatus === 'pending'
      ? { follow_up_status: 'pending', follow_up_date: null }
      : { follow_up_status: newStatus, follow_up_date: new Date().toISOString() }
    const { error } = await supabase
      .from('subscriptions')
      .update(payload)
      .eq('id', subId)
    if (error) { console.error('[Esauriti.updateFollowUp]', error); return }
    fetchData()  // refetch: la riga sparisce dalla sezione corrente e appare nell'altra
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Esauriti</h2>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Ospiti con abbonamento a 0 ingressi: chiama per chiedere se rinnovano e segna l'esito.
      </div>

      {/* SEZIONE 1 — DA CONTATTARE */}
      <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>Da contattare</h3>
      {pendingSorted.length > 0 && (
        <div style={S.alertBar}>
          {pendingSorted.length} ospit{pendingSorted.length === 1 ? 'e' : 'i'} da richiamare
        </div>
      )}
      {pendingSorted.length === 0
        ? <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessun ospite da contattare. Tutti contattati o nessun abbonamento esaurito.</div>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Membro</th>
                  <th style={{ width: '16%' }}>Account</th>
                  <th style={{ width: '20%' }}>Abbonamento</th>
                  <th style={{ width: '16%' }}>Data esaurimento</th>
                  <th style={{ width: 220 }}></th>
                </tr>
              </thead>
              <tbody>
                {pendingSorted.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/admin/ospiti/${s.members?.account_id}`)}>
                      {s.members?.name} {s.members?.surname}
                    </td>
                    <td style={{ fontSize: 12, color: '#888' }}>
                      {s.members?.accounts?.name} {s.members?.accounts?.surname}
                    </td>
                    <td style={{ fontSize: 13 }}>{s.subscription_types?.name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{fmtDateIt(s.esaurimento)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => updateFollowUp(s.id, 'no_renewal')}>
                          Non rinnova
                        </button>
                        <button style={S.btnRenew} onClick={() => updateFollowUp(s.id, 'renewed')}>
                          Rinnova
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {/* SEZIONE 2 — GIA' CONTATTATI (collassabile, default chiusa) */}
      <div style={{ marginTop: 28 }}>
        <div
          onClick={() => setExpanded(v => !v)}
          style={S.collapseHeader}
        >
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            Già contattati ({contacted.length})
          </span>
          <span style={{ color: '#888', fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
        </div>

        {expanded && (
          contacted.length === 0
            ? <div className="card" style={{ color: '#888', fontSize: 13, marginTop: 10 }}>Nessun ospite ancora contattato.</div>
            : (
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '24%' }}>Membro</th>
                      <th style={{ width: '14%' }}>Account</th>
                      <th style={{ width: '18%' }}>Abbonamento</th>
                      <th style={{ width: '12%' }}>Data esaurimento</th>
                      <th style={{ width: '12%' }}>Esito</th>
                      <th style={{ width: '14%' }}>Contattato il</th>
                      <th style={{ width: 100 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacted.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/admin/ospiti/${s.members?.account_id}`)}>
                          {s.members?.name} {s.members?.surname}
                        </td>
                        <td style={{ fontSize: 12, color: '#888' }}>
                          {s.members?.accounts?.name} {s.members?.accounts?.surname}
                        </td>
                        <td style={{ fontSize: 13 }}>{s.subscription_types?.name || '—'}</td>
                        <td style={{ fontSize: 13 }}>{fmtDateIt(s.esaurimento)}</td>
                        <td>
                          <span className={`pill ${s.follow_up_status === 'renewed' ? 'pill-ok' : 'pill-gray'}`}>
                            {s.follow_up_status === 'renewed' ? 'Rinnovato' : 'Non rinnova'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#888' }}>{fmtDateTimeIt(s.follow_up_date)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => updateFollowUp(s.id, 'pending')}>
                            Riapri
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>
    </div>
  )
}

const S = {
  alertBar: {
    background: '#FAEEDA', borderRadius: 8, padding: '10px 14px',
    fontSize: 13, color: '#854F0B', marginBottom: 16,
  },
  btnRenew: {
    background: '#3B6D11', color: '#fff', border: 'none',
    padding: '7px 14px', borderRadius: 8, fontSize: 12,
    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  collapseHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: '#fafafa', borderRadius: 10,
    cursor: 'pointer', border: '0.5px solid #eee',
  },
}
