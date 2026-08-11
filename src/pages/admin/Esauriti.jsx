// ============================================================
// Esauriti — lista membri con sub esaurita (entries_used >=
// entries_total) per follow-up telefonico rinnovo. Tracciamo
// l'esito (rinnova / non rinnova) per non ricontattare due
// volte la stessa persona.
//
// 3 sezioni:
//  1. Da contattare — pending SENZA rinnovo rilevato, per data
//     esaurimento ASC; il contatore conta solo questi
//  2. Hanno gia' rinnovato — rinnovo RILEVATO AUTOMATICAMENTE:
//     il membro ha un nuovo abbonamento attivo con ingressi
//     rimasti, creato dopo la data di esaurimento (confronto
//     sulla sub esaurita piu' recente). Il rinnovo e' a livello
//     di MEMBRO: se rilevato, TUTTE le sue sub esaurite pendenti
//     escono da "Da contattare" e il membro compare qui una
//     volta sola. "Rimuovi dalla lista" archivia in un colpo
//     tutte le sue sub esaurite con l'esito 'renewed' (stesso
//     pattern del tasto Rinnova): finiscono nello storico e non
//     ricompaiono; se il nuovo abbonamento si esaurira', il
//     membro rientrera' normalmente.
//  3. Gia' contattati — collassabile, default chiusa
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
  const [autoRenewed, setAutoRenewed] = useState([])
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

    const pendingAug = pendingFiltered.map(augment)

    // Round 3: rilevamento automatico dei rinnovi. Per ogni membro in
    // lista cerco un ALTRO abbonamento attivo con ingressi rimasti,
    // creato dopo la data di esaurimento (>= sul giorno: il rinnovo
    // fatto lo stesso giorno dell'esaurimento e' il caso piu' comune).
    const memberIds = [...new Set(pendingAug.map(s => s.members?.id).filter(Boolean))]
    const subsByMember = {}
    if (memberIds.length > 0) {
      const { data: memberSubs, error: msErr } = await supabase
        .from('subscriptions')
        .select('id, member_id, created_at, entries_total, entries_used, subscription_types ( name )')
        .in('member_id', memberIds)
        .eq('active', true)
      if (msErr) console.error('[Esauriti.memberSubs]', msErr)
      for (const n of (memberSubs || [])) {
        if (!subsByMember[n.member_id]) subsByMember[n.member_id] = []
        subsByMember[n.member_id].push(n)
      }
    }

    // Il confronto usa la sub esaurita PIU' RECENTE di ogni membro,
    // ma il rinnovo rilevato vale per il MEMBRO intero.
    const latestByMember = {}
    for (const s of pendingAug) {
      const m = s.members?.id
      if (!m) continue
      if (!latestByMember[m] || (s.created_at || '') > (latestByMember[m].created_at || '')) {
        latestByMember[m] = s
      }
    }

    const rinnovoByMember = {}
    for (const s of Object.values(latestByMember)) {
      const nuovi = (subsByMember[s.members.id] || []).filter(n =>
        n.id !== s.id &&
        n.entries_used < n.entries_total &&
        (n.created_at || '') > (s.created_at || '') &&
        (n.created_at || '').slice(0, 10) >= (s.esaurimento || '')
      )
      if (nuovi.length > 0) {
        // il piu' recente: e' quello in uso, con nome e data da mostrare
        rinnovoByMember[s.members.id] = [...nuovi].sort((a, b) =>
          (b.created_at || '').localeCompare(a.created_at || ''))[0]
      }
    }

    // membro rinnovato → fuori da "Da contattare" TUTTE le sue sub
    // esaurite pendenti; in "Hanno gia' rinnovato" una riga sola per
    // membro, che porta con se' gli id di tutte le sub da archiviare
    setPending(pendingAug.filter(s => !rinnovoByMember[s.members?.id]))
    setAutoRenewed(Object.values(latestByMember)
      .filter(s => rinnovoByMember[s.members.id])
      .map(s => {
        const subIds = pendingAug
          .filter(p => p.members?.id === s.members.id)
          .map(p => p.id)
        return { ...s, rinnovo: rinnovoByMember[s.members.id], subIds }
      }))
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

  // Archivia in un colpo TUTTE le sub esaurite pendenti del membro
  // rinnovato (il rinnovo e' a livello di membro, non di singola sub).
  async function archiviaRinnovato(subIds) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ follow_up_status: 'renewed', follow_up_date: new Date().toISOString() })
      .in('id', subIds)
    if (error) { console.error('[Esauriti.archiviaRinnovato]', error); return }
    fetchData()
  }

  if (loading) return <div style={{ padding: 40, color: '#6B6B6B' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Esauriti</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>
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
        ? <div className="card" style={{ color: '#6B6B6B', fontSize: 13 }}>Nessun ospite da contattare. Tutti contattati o nessun abbonamento esaurito.</div>
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
                    <td style={{ fontSize: 12, color: '#6B6B6B' }}>
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

      {/* SEZIONE 2 — HANNO GIA' RINNOVATO (rilevati automaticamente) */}
      {autoRenewed.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>
            Hanno già rinnovato ({autoRenewed.length})
          </h3>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10 }}>
            Rilevati automaticamente: hanno un nuovo abbonamento attivo, non serve chiamarli.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Membro</th>
                  <th style={{ width: '14%' }}>Account</th>
                  <th style={{ width: '18%' }}>Abbonamento esaurito</th>
                  <th style={{ width: '12%' }}>Esaurito il</th>
                  <th style={{ width: '22%' }}>Nuovo abbonamento</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {autoRenewed.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/admin/ospiti/${s.members?.account_id}`)}>
                      {s.members?.name} {s.members?.surname}
                    </td>
                    <td style={{ fontSize: 12, color: '#6B6B6B' }}>
                      {s.members?.accounts?.name} {s.members?.accounts?.surname}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {s.subscription_types?.name || '—'}
                      {s.subIds.length > 1 && (
                        <div style={{ fontSize: 11, color: '#6B6B6B' }}>
                          +{s.subIds.length - 1} altr{s.subIds.length - 1 === 1 ? 'a esaurita' : 'e esaurite'}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{fmtDateIt(s.esaurimento)}</td>
                    <td>
                      <span className="pill pill-ok">Rinnovato</span>
                      <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
                        {s.rinnovo?.subscription_types?.name || '—'} · {fmtDateIt(s.rinnovo?.created_at)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => archiviaRinnovato(s.subIds)}>
                        Rimuovi dalla lista
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEZIONE 3 — GIA' CONTATTATI (collassabile, default chiusa) */}
      <div style={{ marginTop: 28 }}>
        <div
          onClick={() => setExpanded(v => !v)}
          style={S.collapseHeader}
        >
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            Già contattati ({contacted.length})
          </span>
          <span style={{ color: '#6B6B6B', fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
        </div>

        {expanded && (
          contacted.length === 0
            ? <div className="card" style={{ color: '#6B6B6B', fontSize: 13, marginTop: 10 }}>Nessun ospite ancora contattato.</div>
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
                        <td style={{ fontSize: 12, color: '#6B6B6B' }}>
                          {s.members?.accounts?.name} {s.members?.accounts?.surname}
                        </td>
                        <td style={{ fontSize: 13 }}>{s.subscription_types?.name || '—'}</td>
                        <td style={{ fontSize: 13 }}>{fmtDateIt(s.esaurimento)}</td>
                        <td>
                          <span className={`pill ${s.follow_up_status === 'renewed' ? 'pill-ok' : 'pill-gray'}`}>
                            {s.follow_up_status === 'renewed' ? 'Rinnovato' : 'Non rinnova'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#6B6B6B' }}>{fmtDateTimeIt(s.follow_up_date)}</td>
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
    background: '#1E8E3E', color: '#fff', border: 'none',
    padding: '7px 14px', borderRadius: 8, fontSize: 12,
    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  collapseHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: '#fafafa', borderRadius: 10,
    cursor: 'pointer', border: '0.5px solid #E5E3DC',
  },
}
