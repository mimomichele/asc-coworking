import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  GIORNI, GIORNI_LUNGHI, MESI, fmtTime, fmtRangeOrario, oggiStr,
  lunediDellaSettimana, giorniSettimana, addDays, fmtRangeSettimana,
  primoDelMese, addMesi, fmtMeseAnno, settimaneDelMese, inMese,
} from '../../lib/turni'

// 'YYYY-MM-DD' -> 'Lunedì 8 giugno'
function fmtGiorno(ds) {
  const d = new Date(ds + 'T00:00:00')
  return `${GIORNI_LUNGHI[(d.getDay() + 6) % 7]} ${d.getDate()} ${MESI[d.getMonth()]}`
}

export default function MieiTurni({ dipendente }) {
  const [vista, setVista] = useState('settimana') // 'settimana' | 'mese'
  const [monday, setMonday] = useState(() => lunediDellaSettimana(oggiStr()))
  const [mese, setMese] = useState(() => primoDelMese(oggiStr()))
  const [shifts, setShifts] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null) // { shift, start, end, motivo }
  const [saving, setSaving] = useState(false)

  const TODAY = oggiStr()
  const days = useMemo(() => giorniSettimana(monday), [monday])
  const settimane = useMemo(() => settimaneDelMese(mese), [mese])
  const allDays = useMemo(
    () => (vista === 'settimana' ? days : settimane.flat()),
    [vista, days, settimane]
  )

  useEffect(() => { fetchData() }, [vista, monday, mese])

  async function fetchData() {
    setLoading(true)
    const range = vista === 'settimana' ? days : settimane.flat()
    const rangeStart = range[0]
    const rangeEnd = range[range.length - 1]
    // RLS limita già ai propri turni / alle proprie assenze approvate.
    const [shiftRes, leaveRes] = await Promise.all([
      supabase.from('shifts').select('*')
        .gte('data', rangeStart).lte('data', rangeEnd).order('data').order('start_time'),
      supabase.from('leave_requests').select('type,start_date,end_date')
        .eq('stato', 'approved').lte('start_date', rangeEnd).gte('end_date', rangeStart),
    ])
    if (shiftRes.error) showToast('Errore: ' + shiftRes.error.message, 'error')
    setShifts(shiftRes.data || [])
    setLeaves(leaveRes.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const shiftsByDay = useMemo(() => {
    const m = {}
    for (const s of shifts) (m[s.data] ||= []).push(s)
    return m
  }, [shifts])

  // single dipendente → un solo tipo per giorno (malattia ha priorità)
  const leaveByDay = useMemo(() => {
    const m = {}
    for (const d of allDays) {
      for (const l of leaves) {
        if (d >= l.start_date && d <= l.end_date && m[d] !== 'malattia') m[d] = l.type
      }
    }
    return m
  }, [allDays, leaves])

  function nav(dir) {
    if (vista === 'settimana') setMonday(m => addDays(m, dir * 7))
    else setMese(m => addMesi(m, dir))
  }
  function oggi() {
    setMonday(lunediDellaSettimana(oggiStr()))
    setMese(primoDelMese(oggiStr()))
  }

  // --- modale "Richiedi modifica" (invariata) ---
  function openModifica(shift) {
    setModal({ shift, start: fmtTime(shift.start_time), end: fmtTime(shift.end_time), motivo: '' })
  }
  async function inviaRichiesta() {
    if (!modal.start || !modal.end) { showToast('Inserisci i nuovi orari', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('shift_change_requests').insert({
      shift_id: modal.shift.id,
      dipendente_id: dipendente.id,
      requested_data: modal.shift.data,
      requested_start: modal.start,
      requested_end: modal.end,
      motivo: modal.motivo.trim() || null,
      stato: 'pending',
    })
    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast('Richiesta inviata, in attesa di approvazione')
    setSaving(false)
    setModal(null)
  }

  const label = vista === 'settimana' ? fmtRangeSettimana(monday) : fmtMeseAnno(mese)

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>I miei turni</h2>
        {/* TOGGLE VISTA */}
        <div style={{ display: 'inline-flex', border: '0.5px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          {[['settimana', 'Settimana'], ['mese', 'Mese']].map(([k, lab]) => (
            <button key={k} onClick={() => setVista(k)} style={{
              border: 'none', padding: '7px 12px', fontSize: 13, cursor: 'pointer',
              background: vista === k ? '#F5C842' : '#fff', color: vista === k ? '#1a1a1a' : '#888',
              fontWeight: vista === k ? 500 : 400,
            }}>{lab}</button>
          ))}
        </div>
      </div>

      {/* NAV */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button className="btn-ghost" onClick={() => nav(-1)}>◀</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{label}</div>
        <button className="btn-ghost" onClick={() => nav(1)}>▶</button>
        <button className="btn-ghost" onClick={oggi}>Oggi</button>
      </div>

      {loading ? (
        <div style={{ padding: 20, color: '#888' }}>Caricamento...</div>
      ) : vista === 'settimana' ? (
        <SettimanaView days={days} shiftsByDay={shiftsByDay} leaveByDay={leaveByDay} today={TODAY} onModifica={openModifica} />
      ) : (
        <MeseView settimane={settimane} mese={mese} shiftsByDay={shiftsByDay} leaveByDay={leaveByDay} today={TODAY} onModifica={openModifica} />
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, borderRadius: '16px 16px 0 0', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Richiedi modifica orario</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16, textTransform: 'capitalize' }}>
              {fmtGiorno(modal.shift.data)} · attuale {fmtRangeOrario(modal.shift.start_time, modal.shift.end_time)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Nuova entrata</label>
                <input type="time" value={modal.start} onChange={e => setModal(m => ({ ...m, start: e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Nuova uscita</label>
                <input type="time" value={modal.end} onChange={e => setModal(m => ({ ...m, end: e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Motivo (facoltativo)</label>
              <input value={modal.motivo} onChange={e => setModal(m => ({ ...m, motivo: e.target.value }))} placeholder="es. visita medica" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn-primary" onClick={inviaRichiesta} disabled={saving}>
                {saving ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Vista settimana: elenco dei 7 giorni (sola lettura) ---
function SettimanaView({ days, shiftsByDay, leaveByDay, today, onModifica }) {
  return (
    <div>
      {days.map(d => {
        const dayShifts = shiftsByDay[d] || []
        const leave = leaveByDay[d]
        const isToday = d === today
        return (
          <div key={d} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#854F0B' : '#444', textTransform: 'capitalize' }}>
                {fmtGiorno(d)}
              </span>
              {isToday && <span className="pill" style={{ background: '#FAEEDA', color: '#854F0B' }}>oggi</span>}
              {leave && <LeaveBadge type={leave} />}
            </div>
            {dayShifts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#bbb', paddingLeft: 2 }}>—</div>
            ) : dayShifts.map(s => (
              <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '12px 14px' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtRangeOrario(s.start_time, s.end_time)}</div>
                  {s.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.note}</div>}
                </div>
                <button className="btn-ghost" onClick={() => onModifica(s)}>Richiedi modifica</button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// --- Vista mese: calendario 7 colonne (sola lettura) ---
function MeseView({ settimane, mese, shiftsByDay, leaveByDay, today, onModifica }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
      background: '#e5e5e5', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden',
    }}>
      {GIORNI.map((g, i) => (
        <div key={g} style={{ background: '#faf9f6', textAlign: 'center', padding: '6px 0', fontSize: 11, fontWeight: 600, color: i >= 5 ? '#999' : '#444' }}>{g}</div>
      ))}
      {settimane.flat().map(d => {
        const dayShifts = shiftsByDay[d] || []
        const leave = leaveByDay[d]
        const fuori = !inMese(d, mese)
        const isToday = d === today
        const dd = new Date(d + 'T00:00:00')
        return (
          <div key={d} style={{
            background: isToday ? '#FFFBF2' : fuori ? '#f6f5f2' : '#fff',
            minHeight: 66, padding: 4, display: 'flex', flexDirection: 'column', gap: 3,
            opacity: fuori ? 0.55 : 1,
          }}>
            <div style={{
              fontSize: 11, fontWeight: isToday ? 700 : 500, alignSelf: 'flex-start',
              color: isToday ? '#854F0B' : fuori ? '#bbb' : '#666',
              borderRadius: 4, background: isToday ? '#FAEEDA' : 'transparent', padding: '0 4px',
            }}>{dd.getDate()}</div>
            {leave && <LeaveBadge type={leave} compact />}
            {dayShifts.map(s => (
              <div
                key={s.id}
                onClick={() => onModifica(s)}
                title="Tocca per richiedere una modifica"
                style={{
                  background: '#1a1a1a', color: '#fff', borderRadius: 5, padding: '2px 4px',
                  fontSize: 10, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
                }}
              >
                {fmtRangeOrario(s.start_time, s.end_time)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function LeaveBadge({ type, compact }) {
  const mal = type === 'malattia'
  return (
    <span style={{
      fontSize: compact ? 9 : 11, fontWeight: 600, borderRadius: 4,
      padding: compact ? '1px 3px' : '2px 8px', textAlign: 'center',
      background: mal ? '#FCEBEB' : '#E6F1FB', color: mal ? '#A32D2D' : '#185FA5',
      display: 'inline-block',
    }}>
      {mal ? 'Malattia' : 'Ferie'}
    </span>
  )
}
