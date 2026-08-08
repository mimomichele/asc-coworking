// ============================================================
// StaffettaPrenota — tab guest per prenotare gli slot da 10 minuti
// della staffetta "Passa l'Acqua" (12→13 settembre 2026).
//
//   - header con spiegazione dell'evento + banda "Come si prenota"
//   - riga di stato personale (i propri orari, o invito a prenotare)
//   - due tab: Sabato (10:00→23:50) e Domenica (00:00→09:50)
//   - una riga per ora, espandibile; una sola ora aperta alla volta
//   - prenota/annulla con reload dei dati dopo ogni operazione
//   - dopo il termine modifiche (11/09 10:00) i propri slot non
//     sono annullabili: la RLS rifiuterebbe il delete in silenzio,
//     quindi il blocco è calcolato qui e comunicato all'utente
//   - a evento concluso la griglia resta visibile in sola lettura
//
// Nota lessico: nella UI si parla di "slot" (o dei "10 minuti"),
// mai di "fasce" — l'unica eccezione è il conteggio nella riga di
// stato personale.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  loadStaffetta, groupByHour, splitByDay,
  modificheChiuse, eventoConcluso, fmtOra,
} from '../../lib/staffetta'

function Chevron({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// "11:00, 11:10 e 11:30"; oltre i quattro orari: "… e un'altra" / "… e altre N"
function fmtElenco(orari) {
  if (orari.length === 1) return orari[0]
  if (orari.length <= 4) {
    return `${orari.slice(0, -1).join(', ')} e ${orari[orari.length - 1]}`
  }
  const extra = orari.length - 4
  return `${orari.slice(0, 4).join(', ')} e ${extra === 1 ? 'un’altra' : `altre ${extra}`}`
}

export default function StaffettaPrenota({ session }) {
  const [slots, setSlots] = useState(null)   // null = caricamento iniziale
  const [loadError, setLoadError] = useState(false)
  const [day, setDay] = useState('primo')    // 'primo' = sabato, 'secondo' = domenica
  const [openHour, setOpenHour] = useState(null)
  const [busySlot, setBusySlot] = useState(null) // slot.id con operazione in corso
  const [notice, setNotice] = useState('')   // avvisi non bloccanti (es. slot appena preso)
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
        // qualcun altro ha appena preso lo slot: non è un errore, è la realtà
        setNotice('Questo slot è appena stato preso, scegline un altro.')
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
        Non riesco a caricare la staffetta.
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
  const mie = slots.filter(s => s.prenotazione?.mine)
  const giorni = splitByDay(slots)
  const ore = groupByHour(giorni[day])

  return (
    <div style={{ maxWidth: 430, margin: '0 auto' }}>

      {/* header nero */}
      <div style={styles.header}>
        <div style={styles.title}>Staffetta</div>
        <div style={styles.subtitle}>
          24 ore di nuoto no-stop, dalle 10:00 di sabato 12 alle 10:00 di
          domenica 13. Nell&rsquo;acqua c&rsquo;è sempre qualcuno.
        </div>
      </div>

      {/* banda istruzioni */}
      <div style={styles.howto}>
        <div style={styles.howtoTitle}>Come si prenota</div>
        <div style={styles.howtoText}>
          Tocca un&rsquo;ora qui sotto, poi scegli i 10 minuti in cui vuoi nuotare.
          Puoi prenderne quanti vuoi, anche uno solo.
        </div>
      </div>

      {/* riga di stato personale */}
      <div style={styles.statusCard}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {mie.length === 0 ? (
            <>
              <div style={styles.statusTitle}>Non hai ancora prenotato</div>
              <div style={styles.statusSub}>
                {coperte === 1 ? '1 fascia presa' : `${coperte} fasce prese`} su {total}
              </div>
            </>
          ) : (
            <div style={styles.statusTitle}>
              Nuoti alle {fmtElenco(mie.map(s => fmtOra(s.inizio)))}
            </div>
          )}
        </div>
        <span style={styles.statusRight}>10 min l&rsquo;una</span>
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
        const n = h.slots.length
        const libereOra = h.slots.filter(s => !s.prenotazione).length
        const open = openHour === h.key
        const h0 = h.slots[0].inizio.getHours()
        const intervallo = `${String(h0).padStart(2, '0')}:00 – ${String((h0 + 1) % 24).padStart(2, '0')}:00`
        const stato =
          libereOra === 0 ? 'nessuno slot libero' :
          libereOra === n ? `tutti e ${n} gli slot liberi` :
          libereOra === 1 ? `1 slot libero su ${n}` :
          `${libereOra} slot liberi su ${n}`
        return (
          <div key={h.key} style={{ ...styles.hourCard, ...(open ? styles.hourCardOpen : {}) }}>
            <div
              style={styles.hourRow}
              onClick={() => setOpenHour(open ? null : h.key)}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.hourLabel}>{intervallo}</span>
                <span style={{ ...styles.hourState, color: libereOra > 0 ? '#1D9E75' : '#888' }}>
                  {stato}
                </span>
              </span>
              {!open && (
                <span style={{ display: 'flex', gap: 3, marginRight: 10 }}>
                  {h.slots.map(s => (
                    <span
                      key={s.id}
                      style={{
                        width: 11, height: 11, borderRadius: 3,
                        background: s.prenotazione ? '#1a1a1a' : '#fff',
                        border: s.prenotazione ? '1px solid #1a1a1a' : '1px solid #ccc',
                        boxSizing: 'border-box',
                      }}
                    />
                  ))}
                </span>
              )}
              <Chevron open={open} />
            </div>

            {open && (
              <div style={styles.slotList}>
                <div style={styles.slotGuide}>Scegli i tuoi 10 minuti:</div>
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
  let rowStyle = styles.slotRow
  let timeStyle = styles.slotTime
  let right

  if (!p) {
    right = concluso
      ? <span style={styles.slotFree}>libero</span>
      : (
        <button onClick={onPrenota} disabled={busy} style={{ ...styles.bookBtn, ...(busy ? styles.disabled : {}) }}>
          {busy ? '…' : 'Nuoto io'}
        </button>
      )
  } else if (p.mine) {
    rowStyle = { ...styles.slotRow, ...styles.slotRowMine }
    timeStyle = styles.slotTimeMine
    right = (chiuse || concluso)
      ? <span style={styles.mineStatic}>Sei tu</span>
      : (
        <button onClick={onAnnulla} disabled={busy} style={{ ...styles.mineBtn, ...(busy ? styles.disabled : {}) }}>
          {busy ? '…' : 'Sei tu · annulla'}
        </button>
      )
  } else {
    rowStyle = { ...styles.slotRow, ...styles.slotRowOther }
    timeStyle = styles.slotTimeOther
    right = <span style={styles.otherName}>nuota {p.displayName}</span>
  }

  return (
    <div style={rowStyle}>
      <span style={timeStyle}>{fmtOra(slot.inizio)} – {fmtOra(slot.fine)}</span>
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
    background: '#1a1a1a', borderRadius: 16, padding: '18px 18px 16px', marginBottom: 10,
  },
  title: { color: '#F5C200', fontSize: 22, fontWeight: 500, letterSpacing: 0.5 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 4, lineHeight: 1.45 },
  howto: {
    background: '#F5C200', borderRadius: 12, padding: '12px 14px', marginBottom: 10,
  },
  howtoTitle: { color: '#1a1a1a', fontSize: 13, fontWeight: 600, marginBottom: 3 },
  howtoText: { color: '#1a1a1a', fontSize: 12.5, lineHeight: 1.45 },
  statusCard: {
    background: '#fff', border: '0.5px solid #eee', borderRadius: 12,
    padding: '11px 14px', marginBottom: 12,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  statusTitle: { fontSize: 13.5, fontWeight: 500, color: '#1a1a1a' },
  statusSub: { fontSize: 11.5, color: '#888', marginTop: 2 },
  statusRight: { fontSize: 11, color: '#888', flex: 'none' },
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
  hourCardOpen: { border: '1px solid #1a1a1a' },
  hourRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', cursor: 'pointer', userSelect: 'none', gap: 8,
  },
  hourLabel: { display: 'block', fontSize: 15, fontWeight: 500, color: '#1a1a1a' },
  hourState: { display: 'block', fontSize: 11.5, marginTop: 2 },
  slotList: { borderTop: '0.5px solid #eee', padding: '8px 12px 10px' },
  slotGuide: { fontSize: 11.5, color: '#888', margin: '2px 2px 8px' },
  slotRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 10px', borderRadius: 8, marginBottom: 4, minHeight: 38,
    gap: 8,
  },
  slotRowOther: { background: '#f5f5f3' },
  slotRowMine: { background: '#1a1a1a' },
  slotTime: { fontSize: 13, color: '#1a1a1a' },
  slotTimeOther: { fontSize: 13, color: '#888' },
  slotTimeMine: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  slotFree: { fontSize: 12.5, color: '#bbb' },
  bookBtn: {
    background: '#1a1a1a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer',
  },
  mineBtn: {
    background: 'none', color: '#F5C200', border: 'none',
    padding: '7px 0', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  },
  mineStatic: {
    color: '#F5C200', fontSize: 12.5, fontWeight: 500, padding: '7px 0',
  },
  otherName: { fontSize: 12.5, color: '#888' },
  closedNote: {
    fontSize: 12, color: '#888', fontStyle: 'italic',
    padding: '8px 0 2px', textAlign: 'center',
  },
  disabled: { opacity: 0.55, cursor: 'default' },
}
