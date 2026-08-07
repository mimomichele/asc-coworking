// ============================================================
// Staffetta (admin) — controllo copertura della staffetta
// "Passa l'Acqua": riepilogo, griglia di copertura, buchi da
// coprire, chi nuota quando, inserimento manuale per nome.
//
// L'admin può cancellare qualsiasi prenotazione anche dopo il
// termine modifiche dei guest (la RLS glielo consente sempre).
// Date e orari: solo getter locali, mai toISOString.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadStaffetta, groupByHour, fmtOra } from '../../lib/staffetta'

const SLOT_MIN = 10 // durata di una fascia in minuti

function fmtDurata(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  const ore = h === 1 ? '1 ora' : `${h} ore`
  return m === 0 ? ore : `${ore} ${m} min`
}

export default function Staffetta() {
  const [slots, setSlots] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [opError, setOpError] = useState('')
  const [notice, setNotice] = useState('')
  // form inserimento manuale
  const [formSlot, setFormSlot] = useState('')
  const [formNome, setFormNome] = useState('')

  async function reload() {
    setLoadError(false)
    try {
      setSlots(await loadStaffetta(null))
    } catch (e) {
      console.error('[Staffetta admin load]', e)
      setLoadError(true)
    }
  }

  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function assegna(e) {
    e.preventDefault()
    if (!formSlot || !formNome.trim()) return
    setBusy(true); setOpError(''); setNotice('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('staffetta_prenotazioni').insert({
      slot_id: formSlot,
      nome_ospite: formNome.trim(),
      creato_da: user.id,
    })
    setBusy(false)
    if (error) {
      if (error.code === '23505') {
        setNotice('Questa fascia è appena stata presa da qualcun altro.')
        setFormSlot('')
        await reload()
      } else {
        console.error('[Staffetta admin insert]', error)
        setOpError('Inserimento non riuscito. Riprova.')
      }
      return
    }
    setFormSlot(''); setFormNome('')
    await reload()
  }

  async function rimuovi(intervallo, nome) {
    if (!window.confirm(`Rimuovere ${intervallo.label} di ${nome}?`)) return
    setBusy(true); setOpError(''); setNotice('')
    const { error } = await supabase
      .from('staffetta_prenotazioni')
      .delete()
      .in('id', intervallo.prenIds)
    setBusy(false)
    if (error) {
      console.error('[Staffetta admin delete]', error)
      setOpError('Rimozione non riuscita. Riprova.')
      return
    }
    await reload()
  }

  if (loadError) return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>Non riesco a caricare i dati della staffetta.</div>
      <button onClick={reload} style={styles.primaryBtn}>Riprova</button>
    </div>
  )
  if (slots === null) return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>Caricamento…</div>

  // ---- derivati -----------------------------------------------------------
  const refDay = slots.length ? slots[0].inizio.getDate() : null
  const dayLbl = (d) => (d.getDate() === refDay ? 'sab' : 'dom')

  const total = slots.length
  const coperte = slots.filter(s => s.prenotazione).length

  // nuotatori distinti (chiave: user_id oppure nome libero)
  const personeMap = new Map()
  slots.forEach((s, idx) => {
    const p = s.prenotazione
    if (!p) return
    const key = p.userId || `nome:${p.displayName}`
    if (!personeMap.has(key)) personeMap.set(key, { nome: p.displayName, slots: [] })
    personeMap.get(key).slots.push({ ...s, idx })
  })

  // buchi: sequenze consecutive di slot liberi
  const buchi = []
  let run = null
  for (const s of slots) {
    if (!s.prenotazione) {
      if (!run) { run = { da: s, a: s, count: 0 }; buchi.push(run) }
      run.a = s; run.count++
    } else {
      run = null
    }
  }
  buchi.sort((a, b) => b.count - a.count)
  const bucoMax = buchi[0]?.count || 0

  // intervalli per persona (accorpa fasce consecutive)
  const persone = [...personeMap.values()].map(p => {
    const intervalli = []
    let cur = null
    for (const s of p.slots) {
      if (cur && s.inizio.getTime() === cur.fine.getTime()) {
        cur.fine = s.fine
        cur.prenIds.push(s.prenotazione.id)
      } else {
        cur = { inizio: s.inizio, fine: s.fine, prenIds: [s.prenotazione.id] }
        intervalli.push(cur)
      }
    }
    intervalli.forEach(i => {
      const finePrefix = dayLbl(i.fine) !== dayLbl(i.inizio) ? `${dayLbl(i.fine)} ` : ''
      i.label = `${dayLbl(i.inizio)} ${fmtOra(i.inizio)}-${finePrefix}${fmtOra(i.fine)}`
    })
    return { nome: p.nome, count: p.slots.length, intervalli }
  }).sort((a, b) => b.count - a.count)

  const ore = groupByHour(slots)
  const libere = slots.filter(s => !s.prenotazione)

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Staffetta — Passa l&rsquo;Acqua</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        Copertura delle fasce da 10 minuti · 12-13 settembre 2026
      </div>

      {notice && <div style={styles.noticeBand}>{notice}</div>}
      {opError && <div style={styles.errorBand}>{opError}</div>}

      {/* 1 · riepilogo */}
      <div style={styles.statGrid}>
        <div style={styles.stat}>
          <div style={styles.statN}>{coperte}<span style={styles.statDen}>/{total}</span></div>
          <div style={styles.statL}>Fasce coperte</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statN}>{fmtDurata(coperte * SLOT_MIN)}</div>
          <div style={styles.statL}>Tempo coperto</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statN}>{persone.length}</div>
          <div style={styles.statL}>Nuotatori</div>
        </div>
        <div style={{ ...styles.stat, background: '#fdecec' }}>
          <div style={{ ...styles.statN, color: '#b42318' }}>{bucoMax ? fmtDurata(bucoMax * SLOT_MIN) : '—'}</div>
          <div style={styles.statL}>Buco più lungo</div>
        </div>
      </div>

      {/* 2 · griglia copertura */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Copertura</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
          <span style={styles.legend}><span style={{ ...styles.legendDot, background: '#1D9E75' }} /> coperta</span>
          <span style={styles.legend}><span style={{ ...styles.legendDot, background: '#f3d2ce' }} /> scoperta</span>
        </div>
        <div style={styles.covGrid}>
          {/* due colonne sequenziali: prime 12 ore a sinistra, ultime 12 a destra */}
          {[ore.slice(0, Math.ceil(ore.length / 2)), ore.slice(Math.ceil(ore.length / 2))].map((col, c) => (
            <div key={c} style={styles.covCol}>
              {col.map(h => (
                <div key={h.key} style={styles.covRow}>
                  <span style={styles.covLabel}>
                    {dayLbl(h.slots[0].inizio)} {String(h.slots[0].inizio.getHours()).padStart(2, '0')}
                  </span>
                  <span style={{ display: 'flex', gap: 3, flex: 1 }}>
                    {h.slots.map(s => (
                      <span
                        key={s.id}
                        title={`${fmtOra(s.inizio)} – ${fmtOra(s.fine)}${s.prenotazione ? ' · ' + s.prenotazione.displayName : ''}`}
                        style={{
                          flex: 1, height: 14, borderRadius: 3,
                          background: s.prenotazione ? '#1D9E75' : '#f3d2ce',
                        }}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 3 · buchi */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Buchi da coprire</div>
        {buchi.length === 0 ? (
          <div style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500 }}>Nessun buco: copertura completa 🎉</div>
        ) : (
          buchi.map((b, i) => (
            <div key={i} style={styles.gapRow}>
              <span style={{ fontSize: 13 }}>
                {dayLbl(b.da.inizio)} {fmtOra(b.da.inizio)} → {dayLbl(b.a.fine)} {fmtOra(b.a.fine)}
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                {b.count} {b.count === 1 ? 'fascia' : 'fasce'} · {fmtDurata(b.count * SLOT_MIN)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 4 · chi nuota quando */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Chi nuota quando</div>
        {persone.length === 0 ? (
          <div style={{ fontSize: 13, color: '#888' }}>Ancora nessuna prenotazione.</div>
        ) : (
          persone.map((p, i) => (
            <div key={i} style={styles.personRow}>
              <div style={{ minWidth: 160 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.nome}</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  {p.count} {p.count === 1 ? 'fascia' : 'fasce'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.intervalli.map((iv, j) => (
                  <span key={j} style={styles.intervalChip}>
                    {iv.label}
                    <button
                      onClick={() => rimuovi(iv, p.nome)}
                      disabled={busy}
                      title="Rimuovi queste fasce"
                      aria-label={`Rimuovi ${iv.label} di ${p.nome}`}
                      style={styles.chipX}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5 · inserimento manuale */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Assegna una fascia a mano</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Per chi si prenota di persona o al telefono: la fascia risulterà occupata dal nome indicato.
        </div>
        <form onSubmit={assegna} style={styles.formRow}>
          <select
            value={formSlot}
            onChange={e => setFormSlot(e.target.value)}
            style={styles.select}
            required
          >
            <option value="">Fascia libera…</option>
            {libere.map(s => (
              <option key={s.id} value={s.id}>
                {dayLbl(s.inizio)} {fmtOra(s.inizio)} – {fmtOra(s.fine)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={formNome}
            onChange={e => setFormNome(e.target.value)}
            placeholder="Nome e cognome"
            style={styles.input}
            required
          />
          <button type="submit" disabled={busy || !formSlot || !formNome.trim()} style={{ ...styles.primaryBtn, ...(busy ? { opacity: 0.55 } : {}) }}>
            {busy ? '…' : 'Assegna'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  noticeBand: {
    background: '#F5C200', color: '#1a1a1a', borderRadius: 10,
    padding: '9px 12px', fontSize: 12.5, fontWeight: 500, marginBottom: 12,
  },
  errorBand: {
    background: '#fdecec', color: '#b42318', borderRadius: 10,
    padding: '9px 12px', fontSize: 12.5, fontWeight: 500, marginBottom: 12,
  },
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12, marginBottom: 16,
  },
  stat: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '14px 16px',
  },
  statN: { fontSize: 22, fontWeight: 600, color: '#1a1a1a' },
  statDen: { fontSize: 14, fontWeight: 400, color: '#aaa' },
  statL: { fontSize: 11.5, color: '#888', marginTop: 2 },
  card: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '16px 18px', marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: 600, marginBottom: 10 },
  legend: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#888' },
  legendDot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block' },
  covGrid: {
    // due colonne sequenziali; su schermi stretti collassano una sotto l'altra
    display: 'flex', flexWrap: 'wrap', columnGap: 28, rowGap: 5, maxWidth: 640,
  },
  covCol: {
    flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 5,
  },
  covRow: { display: 'flex', alignItems: 'center', gap: 8 },
  covLabel: { fontSize: 11.5, color: '#666', width: 46, flex: 'none', fontVariantNumeric: 'tabular-nums' },
  gapRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 0', borderBottom: '0.5px solid #f0efe9', gap: 12, flexWrap: 'wrap',
  },
  personRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '9px 0', borderBottom: '0.5px solid #f0efe9', flexWrap: 'wrap',
  },
  intervalChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#f5f5f3', border: '0.5px solid #e5e5e5', borderRadius: 8,
    padding: '4px 8px', fontSize: 12,
  },
  chipX: {
    background: 'none', border: 'none', color: '#b42318', cursor: 'pointer',
    fontSize: 11, padding: 0, lineHeight: 1,
  },
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  select: {
    flex: '1 1 180px', padding: '9px 10px', borderRadius: 8,
    border: '0.5px solid #ccc', fontSize: 13, background: '#fff',
  },
  input: {
    flex: '1 1 180px', padding: '9px 10px', borderRadius: 8,
    border: '0.5px solid #ccc', fontSize: 13,
  },
  primaryBtn: {
    background: '#1a1a1a', color: '#F5C200', border: 'none', borderRadius: 8,
    padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
}
