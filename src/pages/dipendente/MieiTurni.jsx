import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GIORNI_LUNGHI, MESI, fmtTime, fmtRangeOrario, oggiStr } from '../../lib/turni'

// 'YYYY-MM-DD' -> 'Lunedì 8 giugno'
function fmtGiorno(ds) {
  const d = new Date(ds + 'T00:00:00')
  return `${GIORNI_LUNGHI[(d.getDay() + 6) % 7]} ${d.getDate()} ${MESI[d.getMonth()]}`
}

export default function MieiTurni({ dipendente }) {
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null) // { shift, start, end, motivo }
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchShifts() }, [])

  async function fetchShifts() {
    // La RLS limita gia' ai propri turni; filtriamo dai turni di oggi in poi.
    const { data, error } = await supabase
      .from('shifts').select('*')
      .gte('data', oggiStr())
      .order('data').order('start_time')
    if (error) showToast('Errore: ' + error.message, 'error')
    setShifts(data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Caricamento...</div>

  // raggruppa per giorno
  const giorni = []
  const byDay = {}
  for (const s of shifts) {
    if (!byDay[s.data]) { byDay[s.data] = []; giorni.push(s.data) }
    byDay[s.data].push(s)
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>I miei turni</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Dai prossimi turni in avanti</div>

      {giorni.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#888' }}>
          Nessun turno in programma.
        </div>
      )}

      {giorni.map(g => (
        <div key={g} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, textTransform: 'capitalize' }}>
            {fmtGiorno(g)}
          </div>
          {byDay[g].map(s => (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '12px 14px' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtRangeOrario(s.start_time, s.end_time)}</div>
                {s.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.note}</div>}
              </div>
              <button className="btn-ghost" onClick={() => openModifica(s)}>Richiedi modifica</button>
            </div>
          ))}
        </div>
      ))}

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
