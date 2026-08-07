// ============================================================
// StaffettaPrenota — tab guest per prenotare le fasce da 10 minuti
// della staffetta "Passa l'Acqua" (12→13 settembre 2026).
//
//   - header nero con avanzamento copertura (N su 144)
//   - due tab: Sabato (10:00→23:50) e Domenica (00:00→09:50)
//   - una riga per ora, espandibile; una sola ora aperta alla volta
//   - prenota/annulla con reload dei dati dopo ogni operazione
//   - dopo il termine modifiche (11/09 10:00) le proprie fasce non
//     sono annullabili: la RLS rifiuterebbe il delete in silenzio,
//     quindi il blocco è calcolato qui e comunicato all'utente
//   - a evento concluso la griglia resta visibile in sola lettura
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  loadStaffetta, groupByHour, splitByDay,
  modificheChiuse, eventoConcluso, fmtOra,
} from '../../lib/staffetta'

export default function StaffettaPrenota({ session }) {
  const [slots, setSlots] = useState(null)   // null = caricamento iniziale
  const [loadError, setLoadError] = useState(false)
  const [day, setDay] = useState('primo')    // 'primo' = sabato, 'secondo' = domenica
  const [openHour, setOpenHour] = useState(null)
  const [busySlot, setBusySlot] = useState(null) // slot.id con operazione in corso
  const [notice, setNotice] = useState('')   // avvisi non bloccanti (es. fascia appena presa)
  const [opError, setOpError] = useState('') // errori operazione

  const chiuse = modificheChiuse()
  const concluso = eventoConcluso()

  async function reload() {
    setLoadError(false)
    try {
      setSlots(await loadStaffetta(session.user.id))
    } catch (e) {
      console.error('[StaffettaPrenota load]', e)
      setLoadError(true)
    }
  }

  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function prenota(slot) {
    setBusySlot(slot.id); setNotice(''); setOpError('')
    const { error } = await supabase.from('staffetta_prenotazioni').insert({
      slot_id: slot.id,
      user_id: session.user.id,
      creato_da: session.user.id,
    })
    setBusySlot(null)
    if (error) {
      if (error.code === '23505') {
        // qualcun altro ha appena preso la fascia: non è un errore, è la realtà
        setNotice('Questa fascia è appena stata presa, scegline un’altra.')
        await reload()
      } else {
        console.error('[StaffettaPrenota insert]', error)
        setOpError('Prenotazione non riuscita. Riprova.')
      }
      return
    }
    await reload()
  }

  async function annulla(slot) {
    if (chiuse) return
    setBusySlot(slot.id); setNotice(''); setOpError('')
    const { error } = await supabase
      .from('staffetta_prenotazioni')
      .delete()
      .eq('id', slot.prenotazione.id)
    setBusySlot(null)
    if (error) {
      console.error('[StaffettaPrenota delete]', error)
      setOpError('Annullamento non riuscito. Riprova.')
      return
    }
    await reload()
  }

  // ---- stati non pronti -------------------------------------------------
  if (loadError) return (
    <div style={styles.centerBox}>
      <div style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 12 }}>
        Non riesco a caricare le fasce della staffetta.
      </div>
      <button onClick={reload} style={styles.retryBtn}>Riprova</button>
    </div>
  )
  if (slots === null) return (
    <div style={styles.centerBox}>
      <div style={{ fontSize: 13, color: '#888' }}>Caricamento…</div>
    </div>
  )

  // ---- dati derivati ----------------------------------------------------
  const total = slots.length
  const coperte = slots.filter(s => s.prenotazione).length
  const libere = total - coperte
  const giorni = splitByDay(slots)
  const ore = groupByHour(giorni[day])

  return (
    <div style={{ maxWidth: 430, margin: '0 auto' }}>

      {/* header nero */}
      <div style={styles.header}>
        <div style={styles.title}>Staffetta</div>
        <div style={styles.subtitle}>12-13 settembre · scegli quando nuoti</div>
        <div style={styles.barTrack}>
          <div style={{ ...styles.barFill, width: `${total ? (coperte / total) * 100 : 0}%` }} />
        </div>
        <div style={styles.barLabel}>
          {coperte} fasce coperte su {total} · {libere} ancora libere
        </div>
      </div>

      {/* tab giorni */}
      <div style={styles.dayTabs}>
        <DayTab label="Sabato" active={day === 'primo'} onClick={() => { setDay('primo'); setOpenHour(null) }} />
        <DayTab label="Domenica" active={day === 'secondo'} onClick={() => { setDay('secondo'); setOpenHour(null) }} />
      </div>

      {concluso && (
        <div style={styles.noticeBand}>Evento concluso — griglia in sola lettura</div>
      )}
      {notice && <div style={styles.noticeBand}>{notice}</div>}
      {opError && <div style={styles.errorBand}>{opError}</div>}

      {/* righe orarie */}
      {ore.map(h => {
        const libereOra = h.slots.filter(s => !s.prenotazione).length
        const open = openHour === h.key
        return (
          <div key={h.key} style={styles.hourCard}>
            <div
              style={styles.hourRow}
              onClick={() => setOpenHour(open ? null : h.key)}
            >
              <span style={styles.hourLabel}>{h.label}</span>
              <span style={{ display: 'flex', gap: 3 }}>
                {h.slots.map(s => (
                  <span
                    key={s.id}
                    style={{
                      width: 9, height: 9, borderRadius: 2,
                      background: s.prenotazione ? '#1a1a1a' : '#e5e3db',
                    }}
                  />
                ))}
              </span>
              <span style={styles.hourState}>
                {libereOra === 0 ? 'piena' : libereOra === h.slots.length ? 'vuota' : `${libereOra} libere`}
              </span>
            </div>

            {open && (
              <div style={styles.slotList}>
                {h.slots.map(s => (
                  <SlotRow
                    key={s.id}
                    slot={s}
                    busy={busySlot === s.id}
                    chiuse={chiuse}
                    concluso={concluso}
                    onPrenota={() => prenota(s)}
                    onAnnulla={() => annulla(s)}
                  />
                ))}
                {chiuse && !concluso && h.slots.some(s => s.prenotazione?.mine) && (
                  <div style={styles.closedNote}>
                    Le modifiche sono chiuse, scrivi alla reception
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SlotRow({ slot, busy, chiuse, concluso, onPrenota, onAnnulla }) {
  const p = slot.prenotazione
  let right
  if (!p) {
    right = concluso
      ? <span style={styles.slotFree}>libera</span>
      : (
        <button onClick={onPrenota} disabled={busy} style={{ ...styles.bookBtn, ...(busy ? styles.disabled : {}) }}>
          {busy ? '…' : 'Prenota'}
        </button>
      )
  } else if (p.mine) {
    right = (chiuse || concluso)
      ? <span style={styles.mineChipStatic}>Tu</span>
      : (
        <button onClick={onAnnulla} disabled={busy} style={{ ...styles.mineChip, ...(busy ? styles.disabled : {}) }}>
          {busy ? '…' : 'Tu · annulla'}
        </button>
      )
  } else {
    right = <span style={styles.otherName}>{p.displayName}</span>
  }

  return (
    <div style={styles.slotRow}>
      <span style={styles.slotTime}>{fmtOra(slot.inizio)} – {fmtOra(slot.fine)}</span>
      {right}
    </div>
  )
}

function DayTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
        border: active ? 'none' : '0.5px solid #ddd',
        background: active ? '#1a1a1a' : '#fff',
        color: active ? '#F5C200' : '#1a1a1a',
        fontSize: 13, fontWeight: 500, transition: 'all .15s',
      }}
    >
      {label}
    </button>
  )
}

const styles = {
  centerBox: {
    maxWidth: 430, margin: '40px auto', textAlign: 'center', padding: 20,
  },
  retryBtn: {
    background: '#1a1a1a', color: '#F5C200', border: 'none', borderRadius: 10,
    padding: '10px 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  header: {
    background: '#1a1a1a', borderRadius: 16, padding: '18px 18px 16px', marginBottom: 12,
  },
  title: { color: '#F5C200', fontSize: 22, fontWeight: 500, letterSpacing: 0.5 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 2 },
  barTrack: {
    height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.15)',
    marginTop: 12, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 99, background: '#F5C200', transition: 'width .3s' },
  barLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, marginTop: 6 },
  dayTabs: { display: 'flex', gap: 8, marginBottom: 12 },
  noticeBand: {
    background: '#F5C200', color: '#1a1a1a', borderRadius: 10,
    padding: '9px 12px', fontSize: 12.5, fontWeight: 500,
    textAlign: 'center', marginBottom: 10,
  },
  errorBand: {
    background: '#fdecec', color: '#b42318', borderRadius: 10,
    padding: '9px 12px', fontSize: 12.5, fontWeight: 500,
    textAlign: 'center', marginBottom: 10,
  },
  hourCard: {
    background: '#fff', borderRadius: 12, marginBottom: 8,
    border: '0.5px solid #eee', overflow: 'hidden',
  },
  hourRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', cursor: 'pointer', userSelect: 'none',
  },
  hourLabel: { fontSize: 14, fontWeight: 500, color: '#1a1a1a', width: 48 },
  hourState: { fontSize: 12, color: '#888', width: 64, textAlign: 'right' },
  slotList: { borderTop: '0.5px solid #eee', padding: '4px 14px 10px' },
  slotRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0', borderBottom: '0.5px solid #f4f2ec', minHeight: 36,
  },
  slotTime: { fontSize: 13, color: '#1a1a1a' },
  slotFree: { fontSize: 12.5, color: '#bbb' },
  bookBtn: {
    background: '#fff', color: '#1a1a1a', border: '0.5px solid #ccc',
    borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer',
  },
  mineChip: {
    background: '#1a1a1a', color: '#F5C200', border: 'none',
    borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer',
  },
  mineChipStatic: {
    background: '#1a1a1a', color: '#F5C200',
    borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 500,
  },
  otherName: { fontSize: 12.5, color: '#888' },
  closedNote: {
    fontSize: 12, color: '#888', fontStyle: 'italic',
    padding: '8px 0 2px', textAlign: 'center',
  },
  disabled: { opacity: 0.55, cursor: 'default' },
}
