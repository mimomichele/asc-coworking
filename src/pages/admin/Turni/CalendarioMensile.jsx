import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import CellaPopover from './CellaPopover'
import {
  GIORNI, oggiStr, giorniSettimana, lunediDellaSettimana,
  fmtRangeOrario, nomeDipendente, primoDelMese, addMesi, fmtMeseAnno,
  settimaneDelMese, inMese,
} from '../../../lib/turni'

const MAX_CHIPS = 3
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 640

// etichetta compatta dipendente (cognome, fallback nome)
function etichettaDip(dip) {
  if (!dip) return '—'
  return (dip.cognome || dip.nome || '—')
}

// ora compatta: 08:00 -> '8', 14:30 -> '14:30'
function oraBreve(t) {
  const [h, m] = String(t || '').split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

// posizionamento popover ancorato (replica la logica di CellaPopover)
function anchoredStyle(anchorRect, width = 240, estH = 300) {
  if (isNarrow() || !anchorRect) {
    return { left: '50%', bottom: 12, transform: 'translateX(-50%)', width: 'min(94vw, 360px)' }
  }
  const vw = window.innerWidth
  let left = anchorRect.left
  if (left + width > vw - 8) left = vw - width - 8
  if (left < 8) left = 8
  let top = anchorRect.bottom + 6
  if (top + estH > window.innerHeight - 8 && anchorRect.top - estH > 8) top = anchorRect.top - estH - 6
  return { left, top, width }
}

export default function CalendarioMensile() {
  const [mese, setMese] = useState(() => primoDelMese(oggiStr()))
  const [dipendenti, setDipendenti] = useState([])
  const [templates, setTemplates] = useState([])
  const [shifts, setShifts] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [picker, setPicker] = useState(null)     // { dateStr, anchorRect }
  const [popover, setPopover] = useState(null)    // { dipendente, dateStr, shift, anchorRect }
  const [dayDetail, setDayDetail] = useState(null) // { dateStr }

  const settimane = useMemo(() => settimaneDelMese(mese), [mese])
  const TODAY = oggiStr()
  const narrow = isNarrow()

  useEffect(() => { fetchMese() }, [mese])

  async function fetchMese() {
    setLoading(true)
    const allDays = settimaneDelMese(mese).flat()
    const rangeStart = allDays[0]
    const rangeEnd = allDays[allDays.length - 1]
    const [dipRes, tplRes, shiftRes, leaveRes] = await Promise.all([
      supabase.from('dipendenti').select('*').eq('attivo', true)
        .order('ordine', { nullsFirst: false }).order('cognome').order('nome'),
      supabase.from('shift_templates').select('*').order('start_time'),
      supabase.from('shifts').select('*').gte('data', rangeStart).lte('data', rangeEnd).order('start_time'),
      supabase.from('leave_requests').select('dipendente_id,type,start_date,end_date')
        .eq('stato', 'approved').lte('start_date', rangeEnd).gte('end_date', rangeStart),
    ])
    if (dipRes.error) showToast('Errore dipendenti: ' + dipRes.error.message, 'error')
    if (shiftRes.error) showToast('Errore turni: ' + shiftRes.error.message, 'error')
    setDipendenti(dipRes.data || [])
    setTemplates(tplRes.data || [])
    setShifts(shiftRes.data || [])
    setLeaves(leaveRes.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const dipMap = useMemo(() => {
    const m = {}
    for (const d of dipendenti) m[d.id] = d
    return m
  }, [dipendenti])

  const shiftsByDay = useMemo(() => {
    const m = {}
    for (const s of shifts) (m[s.data] ||= []).push(s)
    return m
  }, [shifts])

  const leavesByDay = useMemo(() => {
    const m = {}
    const allDays = settimane.flat()
    for (const l of leaves) {
      for (const d of allDays) {
        if (d >= l.start_date && d <= l.end_date) (m[d] ||= []).push({ dipendente_id: l.dipendente_id, type: l.type })
      }
    }
    return m
  }, [leaves, settimane])

  function itemsForDay(d) {
    const sh = (shiftsByDay[d] || []).map(s => ({ kind: 'shift', s }))
    const lv = (leavesByDay[d] || []).map(l => ({ kind: 'leave', ...l }))
    return [...sh, ...lv]
  }

  // --- interazioni ---
  function openCreatePicker(e, dateStr) {
    e.stopPropagation()
    setPicker({ dateStr, anchorRect: e.currentTarget.getBoundingClientRect() })
  }
  function onPickDipendente(dip) {
    setPopover({ dipendente: dip, dateStr: picker.dateStr, shift: null, anchorRect: picker.anchorRect })
    setPicker(null)
  }
  function openEditShift(e, shift) {
    e.stopPropagation()
    setPopover({
      dipendente: dipMap[shift.dipendente_id] || { id: shift.dipendente_id },
      dateStr: shift.data, shift, anchorRect: e.currentTarget.getBoundingClientRect(),
    })
  }
  function openAddInDay(e, dateStr) {
    setPicker({ dateStr, anchorRect: e.currentTarget.getBoundingClientRect() })
  }
  function onSaved() {
    setPopover(null)
    fetchMese()
  }

  const popWeekDays = popover ? giorniSettimana(lunediDellaSettimana(popover.dateStr)) : []

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* NAV MESE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn-ghost" onClick={() => setMese(m => addMesi(m, -1))}>◀</button>
        <div style={{ minWidth: 180, textAlign: 'center', fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>
          {fmtMeseAnno(mese)}
        </div>
        <button className="btn-ghost" onClick={() => setMese(m => addMesi(m, 1))}>▶</button>
        <button className="btn-ghost" onClick={() => setMese(primoDelMese(oggiStr()))}>Oggi</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
          background: '#e5e5e5', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden',
        }}>
          {/* intestazione giorni */}
          {GIORNI.map((g, i) => (
            <div key={g} style={{
              background: '#faf9f6', textAlign: 'center', padding: '6px 0',
              fontSize: 11, fontWeight: 600, color: i >= 5 ? '#999' : '#444',
            }}>{g}</div>
          ))}

          {/* celle giorno */}
          {settimane.flat().map((d, idx) => {
            const items = itemsForDay(d)
            const fuori = !inMese(d, mese)
            const isToday = d === TODAY
            const dd = new Date(d + 'T00:00:00')
            const weekendCol = idx % 7 >= 5
            return (
              <div
                key={d}
                onClick={(e) => narrow ? setDayDetail({ dateStr: d }) : openCreatePicker(e, d)}
                style={{
                  background: isToday ? '#FFFBF2' : fuori ? '#f6f5f2' : weekendCol ? '#fbfaf7' : '#fff',
                  minHeight: narrow ? 56 : 104, padding: 4, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  opacity: fuori ? 0.55 : 1,
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); setDayDetail({ dateStr: d }) }}
                  style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 500, alignSelf: 'flex-start',
                    color: isToday ? '#854F0B' : fuori ? '#bbb' : '#666',
                    minWidth: 18, textAlign: 'center', borderRadius: 4,
                    background: isToday ? '#FAEEDA' : 'transparent', padding: '0 4px',
                  }}
                >{dd.getDate()}</div>

                {narrow ? (
                  <CompactCount items={items} />
                ) : (
                  <>
                    {items.slice(0, MAX_CHIPS).map((it, i) => it.kind === 'shift' ? (
                      <div
                        key={'s' + it.s.id}
                        onClick={(e) => openEditShift(e, it.s)}
                        title={`${nomeDipendente(dipMap[it.s.dipendente_id] || {})} ${fmtRangeOrario(it.s.start_time, it.s.end_time)}`}
                        style={chipShift}
                      >
                        {etichettaDip(dipMap[it.s.dipendente_id])} {oraBreve(it.s.start_time)}-{oraBreve(it.s.end_time)}
                      </div>
                    ) : (
                      <div key={'l' + i} style={{ ...chipLeave, ...(it.type === 'malattia' ? chipMal : chipFer) }}>
                        {etichettaDip(dipMap[it.dipendente_id])} {it.type === 'malattia' ? 'malattia' : 'ferie'}
                      </div>
                    ))}
                    {items.length > MAX_CHIPS && (
                      <div
                        onClick={(e) => { e.stopPropagation(); setDayDetail({ dateStr: d }) }}
                        style={{ fontSize: 10, color: '#185FA5', cursor: 'pointer', paddingLeft: 2 }}
                      >
                        +{items.length - MAX_CHIPS} altri
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* SELETTORE DIPENDENTE */}
      {picker && (
        <SelettoreDipendente
          dipendenti={dipendenti}
          anchorRect={picker.anchorRect}
          onPick={onPickDipendente}
          onClose={() => setPicker(null)}
        />
      )}

      {/* DETTAGLIO GIORNO */}
      {dayDetail && (
        <DettaglioGiorno
          dateStr={dayDetail.dateStr}
          items={itemsForDay(dayDetail.dateStr)}
          dipMap={dipMap}
          onEditShift={openEditShift}
          onAdd={(e) => openAddInDay(e, dayDetail.dateStr)}
          onClose={() => setDayDetail(null)}
        />
      )}

      {/* POPOVER INSERIMENTO/MODIFICA (riuso) */}
      {popover && (
        <CellaPopover
          dipendente={popover.dipendente}
          dateStr={popover.dateStr}
          shift={popover.shift}
          templates={templates}
          weekDays={popWeekDays}
          anchorRect={popover.anchorRect}
          onSaved={onSaved}
          onClose={() => setPopover(null)}
          onToast={showToast}
        />
      )}
    </div>
  )
}

// indicatore compatto per mobile: conteggio turni + puntini assenze
function CompactCount({ items }) {
  const turni = items.filter(i => i.kind === 'shift').length
  const ferie = items.some(i => i.kind === 'leave' && i.type === 'ferie')
  const malattia = items.some(i => i.kind === 'leave' && i.type === 'malattia')
  if (turni === 0 && !ferie && !malattia) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {turni > 0 && (
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#1a1a1a', borderRadius: 8, padding: '1px 6px' }}>
          {turni}
        </span>
      )}
      {ferie && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#185FA5' }} />}
      {malattia && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E24B4A' }} />}
    </div>
  )
}

// selettore dipendente ancorato
function SelettoreDipendente({ dipendenti, anchorRect, onPick, onClose }) {
  const style = anchoredStyle(anchorRect, 240, 320)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 1100 }} />
      <div className="card" style={{
        position: 'fixed', zIndex: 1101, padding: 8, maxHeight: '70vh', overflowY: 'auto',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)', ...style,
      }}>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px 8px' }}>
          Scegli dipendente
        </div>
        {dipendenti.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, color: '#888' }}>Nessun dipendente attivo.</div>
        )}
        {dipendenti.map(d => (
          <button
            key={d.id}
            onClick={() => onPick(d)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none',
              padding: '9px 8px', fontSize: 14, cursor: 'pointer', borderRadius: 8, color: '#1a1a1a',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f3'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {nomeDipendente(d)}
            {d.ruolo && <span style={{ color: '#aaa', fontSize: 12 }}> · {d.ruolo}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

// dettaglio giorno (bottom sheet) con lista completa + aggiunta
function DettaglioGiorno({ dateStr, items, dipMap, onEditShift, onAdd, onClose }) {
  const dd = new Date(dateStr + 'T00:00:00')
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  const shiftsItems = items.filter(i => i.kind === 'shift')
  const leaveItems = items.filter(i => i.kind === 'leave')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 560, borderRadius: '16px 16px 0 0', padding: 18, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{dd.getDate()} {MESI_BREVI[dd.getMonth()]} {dd.getFullYear()}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer' }}>✕</button>
        </div>

        {leaveItems.map((l, i) => (
          <div key={'l' + i} className="card" style={{ marginBottom: 8, padding: '8px 10px', background: l.type === 'malattia' ? '#FCEBEB' : '#E6F1FB' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: l.type === 'malattia' ? '#A32D2D' : '#185FA5' }}>
              {nomeDipendente(dipMap[l.dipendente_id] || {})} — {l.type === 'malattia' ? 'malattia' : 'ferie'}
            </span>
          </div>
        ))}

        {shiftsItems.length === 0 && leaveItems.length === 0 && (
          <div style={{ fontSize: 13, color: '#888', padding: '8px 0 14px' }}>Nessun turno in questo giorno.</div>
        )}

        {shiftsItems.map(({ s }) => (
          <div
            key={s.id}
            onClick={(e) => onEditShift(e, s)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', marginBottom: 8, border: '0.5px solid #eee', borderRadius: 10, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 14, fontWeight: 500 }}>{nomeDipendente(dipMap[s.dipendente_id] || {})}</span>
            <span style={{ fontSize: 13, color: '#444' }}>{fmtRangeOrario(s.start_time, s.end_time)}{s.note ? ' ·' : ''}</span>
          </div>
        ))}

        <button className="btn-primary" onClick={onAdd} style={{ width: '100%', marginTop: 4 }}>+ Aggiungi turno</button>
      </div>
    </div>
  )
}

const chipShift = {
  background: '#1a1a1a', color: '#fff', borderRadius: 5, padding: '2px 5px',
  fontSize: 10, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
}
const chipLeave = {
  borderRadius: 5, padding: '2px 5px', fontSize: 10, fontWeight: 600,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const chipFer = { background: '#E6F1FB', color: '#185FA5' }
const chipMal = { background: '#FCEBEB', color: '#A32D2D' }
