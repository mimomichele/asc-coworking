import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import CellaPopover from './CellaPopover'
import CalendarioMensile from './CalendarioMensile'
import {
  GIORNI, addDays, oggiStr, giorniSettimana, lunediDellaSettimana,
  fmtRangeSettimana, fmtRangeOrario, nomeDipendente, iniziali,
} from '../../../lib/turni'

export default function PlannerTurni() {
  const [vista, setVista] = useState('settimana') // 'settimana' | 'mese'
  const [monday, setMonday] = useState(() => lunediDellaSettimana(oggiStr()))
  const [dipendenti, setDipendenti] = useState([])
  const [templates, setTemplates] = useState([])
  const [shifts, setShifts] = useState([])
  const [leaves, setLeaves] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [popover, setPopover] = useState(null) // { dipendente, dateStr, shift, anchorRect }
  const [confirmCopy, setConfirmCopy] = useState(null) // { count, rows, skipExisting }
  const [copying, setCopying] = useState(false)

  const weekDays = useMemo(() => giorniSettimana(monday), [monday])
  const TODAY = oggiStr()

  useEffect(() => { fetchAll() }, [monday])

  async function fetchAll() {
    setLoading(true)
    const weekEnd = addDays(monday, 6)
    const [dipRes, tplRes, shiftRes, leaveRes, scrCount, ferieCount] = await Promise.all([
      supabase.from('dipendenti').select('*').eq('attivo', true)
        .order('ordine', { nullsFirst: false }).order('cognome').order('nome'),
      supabase.from('shift_templates').select('*').order('start_time'),
      supabase.from('shifts').select('*')
        .gte('data', monday).lte('data', weekEnd)
        .order('start_time'),
      // ferie/malattie approvate che intersecano la settimana
      supabase.from('leave_requests').select('dipendente_id,type,start_date,end_date')
        .eq('stato', 'approved').lte('start_date', weekEnd).gte('end_date', monday),
      supabase.from('shift_change_requests').select('id', { count: 'exact', head: true }).eq('stato', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('type', 'ferie').eq('stato', 'pending'),
    ])
    if (dipRes.error) showToast('Errore dipendenti: ' + dipRes.error.message, 'error')
    if (tplRes.error) showToast('Errore predefiniti: ' + tplRes.error.message, 'error')
    if (shiftRes.error) showToast('Errore turni: ' + shiftRes.error.message, 'error')
    setDipendenti(dipRes.data || [])
    setTemplates(tplRes.data || [])
    setShifts(shiftRes.data || [])
    setLeaves(leaveRes.data || [])
    setPendingCount((scrCount.count || 0) + (ferieCount.count || 0))
    setLoading(false)
  }

  // mappa { dipendente_id: { 'YYYY-MM-DD': [shift...] } }
  const shiftMap = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      ;(m[s.dipendente_id] ||= {})
      ;(m[s.dipendente_id][s.data] ||= []).push(s)
    }
    return m
  }, [shifts])

  // mappa assenze approvate { dipendente_id: { 'YYYY-MM-DD': 'ferie'|'malattia' } }
  // (la malattia ha priorità sul badge se nello stesso giorno).
  const leaveMap = useMemo(() => {
    const m = {}
    for (const l of leaves) {
      for (const d of weekDays) {
        if (d >= l.start_date && d <= l.end_date) {
          ;(m[l.dipendente_id] ||= {})
          if (m[l.dipendente_id][d] !== 'malattia') m[l.dipendente_id][d] = l.type
        }
      }
    }
    return m
  }, [leaves, weekDays])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openCell(e, dipendente, dateStr, shift = null) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({ dipendente, dateStr, shift, anchorRect: rect })
  }

  function onSaved() {
    setPopover(null)
    fetchAll()
  }

  // --- Copia settimana precedente ---
  async function preparaCopia() {
    const prevMonday = addDays(monday, -7)
    const { data, error } = await supabase.from('shifts').select('*')
      .gte('data', prevMonday).lte('data', addDays(prevMonday, 6))
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    if (!data || data.length === 0) { showToast('La settimana precedente non ha turni da copiare', 'error'); return }
    setConfirmCopy({ source: data, skipExisting: true })
  }

  async function eseguiCopia() {
    if (!confirmCopy) return
    setCopying(true)
    const { data: { user } } = await supabase.auth.getUser()
    // chiavi dei turni già presenti nella settimana corrente (per skip)
    const existingKeys = new Set(shifts.map(s => `${s.dipendente_id}|${s.data}`))
    let rows = confirmCopy.source.map(s => ({
      dipendente_id: s.dipendente_id,
      data: addDays(s.data, 7),
      start_time: s.start_time,
      end_time: s.end_time,
      note: s.note,
      created_by: user?.id ?? null,
    }))
    if (confirmCopy.skipExisting) {
      rows = rows.filter(r => !existingKeys.has(`${r.dipendente_id}|${r.data}`))
    }
    if (rows.length === 0) {
      showToast('Niente da copiare (i giorni hanno già turni)', 'error')
      setCopying(false); setConfirmCopy(null); return
    }
    const { error } = await supabase.from('shifts').insert(rows)
    if (error) { showToast('Errore: ' + error.message, 'error'); setCopying(false); return }
    showToast(`${rows.length} turni copiati`)
    setCopying(false)
    setConfirmCopy(null)
    fetchAll()
  }

  const copyCount = useMemo(() => {
    if (!confirmCopy) return 0
    if (!confirmCopy.skipExisting) return confirmCopy.source.length
    const existingKeys = new Set(shifts.map(s => `${s.dipendente_id}|${s.data}`))
    return confirmCopy.source.filter(s => !existingKeys.has(`${s.dipendente_id}|${addDays(s.data, 7)}`)).length
  }, [confirmCopy, shifts])

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Turni</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Pianificatore settimanale</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* TOGGLE VISTA */}
          <div style={{ display: 'inline-flex', border: '0.5px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            {[['settimana', 'Settimana'], ['mese', 'Mese']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setVista(k)}
                style={{
                  border: 'none', padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  background: vista === k ? '#F5C842' : '#fff',
                  color: vista === k ? '#1a1a1a' : '#888', fontWeight: vista === k ? 500 : 400,
                }}
              >{label}</button>
            ))}
          </div>
          <Link to="/admin/turni/richieste" className="btn-ghost" style={{ textDecoration: 'none', position: 'relative' }}>
            Richieste
            {pendingCount > 0 && (
              <span style={{
                marginLeft: 6, background: '#E24B4A', color: '#fff', borderRadius: 10,
                fontSize: 11, fontWeight: 600, padding: '1px 7px',
              }}>{pendingCount}</span>
            )}
          </Link>
          {vista === 'settimana' && (
            <button className="btn-ghost" onClick={preparaCopia}>Copia settimana precedente</button>
          )}
          <Link to="/admin/turni/report" className="btn-ghost" style={{ textDecoration: 'none' }}>Report ore</Link>
          <Link to="/admin/turni/predefiniti" className="btn-ghost" style={{ textDecoration: 'none' }}>Turni predefiniti</Link>
          <Link to="/admin/turni/dipendenti" className="btn-ghost" style={{ textDecoration: 'none' }}>Dipendenti</Link>
        </div>
      </div>

      {vista === 'mese' && <CalendarioMensile />}

      {vista === 'settimana' && (<>
      {/* NAV SETTIMANA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn-ghost" onClick={() => setMonday(m => addDays(m, -7))}>◀</button>
        <div style={{ minWidth: 200, textAlign: 'center', fontSize: 14, fontWeight: 500 }}>
          {fmtRangeSettimana(monday)}
        </div>
        <button className="btn-ghost" onClick={() => setMonday(m => addDays(m, 7))}>▶</button>
        <button className="btn-ghost" onClick={() => setMonday(lunediDellaSettimana(oggiStr()))}>Oggi</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>
      ) : dipendenti.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#888' }}>
          Nessun dipendente attivo. <Link to="/admin/turni/dipendenti">Aggiungine uno</Link> per iniziare a inserire i turni.
        </div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 760, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 2, background: '#faf9f6', minWidth: 150, textAlign: 'left' }}>
                  Dipendente
                </th>
                {weekDays.map((d, i) => {
                  const dd = new Date(d + 'T00:00:00')
                  const isToday = d === TODAY
                  const isWeekend = i >= 5
                  return (
                    <th key={d} style={{
                      ...thStyle, minWidth: 88,
                      background: isToday ? '#FAEEDA' : isWeekend ? '#f4f3ef' : '#faf9f6',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? '#854F0B' : '#444' }}>{GIORNI[i]}</div>
                      <div style={{ fontSize: 11, color: isToday ? '#854F0B' : '#999' }}>{dd.getDate()}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {dipendenti.map(dip => (
                <tr key={dip.id}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 1, background: '#fff', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{iniziali(dip)}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.1 }}>{nomeDipendente(dip)}</div>
                        {dip.ruolo && <div style={{ fontSize: 11, color: '#aaa' }}>{dip.ruolo}</div>}
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d, i) => {
                    const cellShifts = shiftMap[dip.id]?.[d] || []
                    const leave = leaveMap[dip.id]?.[d]
                    const isToday = d === TODAY
                    const isWeekend = i >= 5
                    return (
                      <td
                        key={d}
                        onClick={(e) => openCell(e, dip, d)}
                        style={{
                          ...tdStyle, cursor: 'pointer', verticalAlign: 'top', padding: 5,
                          background: isToday ? '#FFFBF2' : isWeekend ? '#fbfaf7' : '#fff',
                        }}
                      >
                        {leave && (
                          <div style={{
                            fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '2px 4px', marginBottom: 4,
                            textAlign: 'center',
                            background: leave === 'malattia' ? '#FCEBEB' : '#E6F1FB',
                            color: leave === 'malattia' ? '#A32D2D' : '#185FA5',
                          }}>
                            {leave === 'malattia' ? 'Malattia' : 'Ferie'}
                          </div>
                        )}
                        {cellShifts.length === 0 ? (
                          <div style={{ minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ddd', fontSize: 16 }}>+</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {cellShifts.map(s => (
                              <div
                                key={s.id}
                                onClick={(e) => openCell(e, dip, d, s)}
                                title={s.note || ''}
                                style={{
                                  background: '#1a1a1a', color: '#fff', borderRadius: 6,
                                  padding: '4px 6px', fontSize: 11, fontWeight: 500,
                                  whiteSpace: 'nowrap', textAlign: 'center',
                                }}
                              >
                                {fmtRangeOrario(s.start_time, s.end_time)}
                                {s.note ? <span style={{ color: '#F5C842' }}> •</span> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {popover && (
        <CellaPopover
          dipendente={popover.dipendente}
          dateStr={popover.dateStr}
          shift={popover.shift}
          templates={templates}
          weekDays={weekDays}
          anchorRect={popover.anchorRect}
          onSaved={onSaved}
          onClose={() => setPopover(null)}
          onToast={showToast}
        />
      )}

      {confirmCopy && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 420, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Copia settimana precedente</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              Verranno copiati <strong>{copyCount}</strong> turni dalla settimana precedente su quella corrente
              ({fmtRangeSettimana(monday)}).
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444', marginBottom: 20, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmCopy.skipExisting}
                onChange={e => setConfirmCopy(c => ({ ...c, skipExisting: e.target.checked }))}
              />
              Salta i giorni che hanno già un turno
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmCopy(null)}>Annulla</button>
              <button className="btn-primary" onClick={eseguiCopia} disabled={copying || copyCount === 0}>
                {copying ? 'Copia...' : `Copia ${copyCount} turni`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle = {
  padding: '8px 6px', textAlign: 'center', fontSize: 12,
  borderBottom: '0.5px solid #e5e5e5', position: 'sticky', top: 0,
}
const tdStyle = {
  padding: '6px', textAlign: 'center',
  borderBottom: '0.5px solid #eee', borderLeft: '0.5px solid #f0f0f0',
}
