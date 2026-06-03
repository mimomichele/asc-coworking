import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GIORNI, fmtTime, nomeDipendente } from '../../../lib/turni'

// Popover inline per creare / modificare / eliminare un turno.
// Props:
//   dipendente   : record dipendente (riga)
//   dateStr      : 'YYYY-MM-DD' della cella
//   shift        : record shift esistente (modifica) oppure null (creazione)
//   templates    : shift_templates per i chip a tap rapido
//   weekDays     : array dei 7 giorni della settimana (per "applica anche a…")
//   anchorRect   : DOMRect della cella cliccata (posizionamento)
//   onSaved      : callback dopo insert/update/delete → ricarica griglia
//   onClose      : chiude il popover
//   onToast      : (msg, type) per i toast del parent
export default function CellaPopover({ dipendente, dateStr, shift, templates, weekDays, anchorRect, onSaved, onClose, onToast }) {
  const isEdit = !!shift
  const [start, setStart] = useState(shift ? fmtTime(shift.start_time) : '08:00')
  const [end, setEnd] = useState(shift ? fmtTime(shift.end_time) : '14:00')
  const [note, setNote] = useState(shift?.note || '')
  // seconda fascia (turno spezzato) — solo in creazione.
  const [hasSecond, setHasSecond] = useState(false)
  const [start2, setStart2] = useState('16:00')
  const [end2, setEnd2] = useState('20:00')
  // giorni extra su cui replicare (solo in creazione). Mappa dateStr → bool.
  const [extraDays, setExtraDays] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Chiudi con Esc.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function applyTemplate(t) {
    setStart(fmtTime(t.start_time))
    setEnd(fmtTime(t.end_time))
    // In modifica si edita un singolo shift: la seconda fascia non si applica.
    if (isEdit) return
    if (t.start_time_2 && t.end_time_2) {
      setHasSecond(true)
      setStart2(fmtTime(t.start_time_2))
      setEnd2(fmtTime(t.end_time_2))
    } else {
      setHasSecond(false)
    }
  }

  function toggleExtra(ds) {
    setExtraDays(prev => ({ ...prev, [ds]: !prev[ds] }))
  }

  async function salva() {
    if (!start || !end) { onToast('Inserisci entrata e uscita', 'error'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (isEdit) {
      const { error } = await supabase.from('shifts')
        .update({ start_time: start, end_time: end, note: note.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', shift.id)
      if (error) { onToast('Errore: ' + error.message, 'error'); setSaving(false); return }
      onToast('Turno aggiornato')
    } else {
      // Fasce orarie da inserire: la prima sempre, la seconda se "spezzato".
      const fasce = [{ s: start, e: end }]
      if (hasSecond) {
        if (!start2 || !end2) { onToast('Inserisci la seconda fascia', 'error'); setSaving(false); return }
        fasce.push({ s: start2, e: end2 })
      }
      // Creazione: giorno cliccato + eventuali giorni extra selezionati.
      // Per ogni giorno inseriamo uno shift per ciascuna fascia.
      const dates = [dateStr, ...weekDays.filter(d => d !== dateStr && extraDays[d])]
      const rows = dates.flatMap(d => fasce.map(f => ({
        dipendente_id: dipendente.id,
        data: d,
        start_time: f.s,
        end_time: f.e,
        note: note.trim() || null,
        created_by: user?.id ?? null,
      })))
      const { error } = await supabase.from('shifts').insert(rows)
      if (error) { onToast('Errore: ' + error.message, 'error'); setSaving(false); return }
      onToast(rows.length > 1 ? `${rows.length} turni creati` : 'Turno creato')
    }
    setSaving(false)
    onSaved()
  }

  async function elimina() {
    setSaving(true)
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id)
    if (error) { onToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    onToast('Turno eliminato')
    setSaving(false)
    onSaved()
  }

  // --- posizionamento ---
  // Su schermo stretto: bottom-sheet centrato in basso. Altrimenti:
  // ancorato sotto la cella, con clamp orizzontale al viewport.
  const popStyle = useMemo(() => {
    const W = 300
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640
    if (isNarrow || !anchorRect) {
      return { left: '50%', bottom: 12, transform: 'translateX(-50%)', width: 'min(94vw, 360px)' }
    }
    const vw = window.innerWidth
    let left = anchorRect.left
    if (left + W > vw - 8) left = vw - W - 8
    if (left < 8) left = 8
    let top = anchorRect.bottom + 6
    // se non c'è spazio sotto, mettilo sopra
    const estH = 320
    if (top + estH > window.innerHeight - 8 && anchorRect.top - estH > 8) {
      top = anchorRect.top - estH - 6
    }
    return { left, top, width: W }
  }, [anchorRect])

  const giornoOrdine = weekDays.indexOf(dateStr)

  return (
    <>
      {/* overlay per click-fuori */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 1000 }} />

      <div
        className="card"
        style={{
          position: 'fixed', zIndex: 1001, padding: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)', maxHeight: '88vh', overflowY: 'auto',
          ...popStyle,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeDipendente(dipendente)}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'capitalize' }}>
              {GIORNI[giornoOrdine === -1 ? 0 : giornoOrdine]} · {fmtData(dateStr)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* template a tap rapido */}
        {templates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Predefiniti</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  style={{
                    border: '0.5px solid #ddd', background: '#faf9f6', borderRadius: 16,
                    padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#444',
                  }}
                  title={t.label}
                >
                  {t.label}{' '}
                  <span style={{ color: '#aaa' }}>
                    {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                    {t.start_time_2 && t.end_time_2 ? ` / ${fmtTime(t.start_time_2)}–${fmtTime(t.end_time_2)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{hasSecond ? 'Entrata 1' : 'Entrata'}</label>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{hasSecond ? 'Uscita 1' : 'Uscita'}</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        {/* seconda fascia (turno spezzato) — solo in creazione */}
        {!isEdit && (hasSecond ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Seconda fascia</span>
              <button
                onClick={() => setHasSecond(false)}
                style={{ background: 'none', border: 'none', color: '#E24B4A', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                Rimuovi
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Entrata 2</label>
                <input type="time" value={start2} onChange={e => setStart2(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Uscita 2</label>
                <input type="time" value={end2} onChange={e => setEnd2(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setHasSecond(true)}
            style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 12, cursor: 'pointer', padding: '8px 0 0', display: 'block' }}
          >
            + Aggiungi seconda fascia (spezzato)
          </button>
        ))}

        <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
          <label>Note (facoltativo)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="es. spezzato, sostituzione…" />
        </div>

        {/* applica anche a… (solo in creazione) */}
        {!isEdit && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Applica anche a…</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {weekDays.map((d, i) => {
                const isCurrent = d === dateStr
                const on = isCurrent || extraDays[d]
                return (
                  <button
                    key={d}
                    onClick={() => !isCurrent && toggleExtra(d)}
                    disabled={isCurrent}
                    style={{
                      border: `0.5px solid ${on ? '#F5C842' : '#ddd'}`,
                      background: on ? '#FAEEDA' : '#fff',
                      color: on ? '#854F0B' : '#888',
                      borderRadius: 8, padding: '5px 9px', fontSize: 12,
                      cursor: isCurrent ? 'default' : 'pointer', fontWeight: on ? 500 : 400,
                      opacity: isCurrent ? 0.85 : 1,
                    }}
                  >
                    {GIORNI[i]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          {isEdit
            ? <button className="btn-danger" onClick={() => setConfirmDelete(true)} disabled={saving}>Elimina</button>
            : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>
              {saving ? '...' : isEdit ? 'Salva' : 'Aggiungi'}
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div style={{ marginTop: 12, padding: 12, background: '#FCEBEB', borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: '#A32D2D', marginBottom: 10 }}>Eliminare questo turno?</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>No</button>
              <button
                style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                onClick={elimina}
              >
                Sì, elimina
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// 'YYYY-MM-DD' -> '2 giu' compatto per l'header del popover.
function fmtData(ds) {
  const d = new Date(ds + 'T00:00:00')
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${d.getDate()} ${mesi[d.getMonth()]}`
}
