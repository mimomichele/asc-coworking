import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fmtRangeOrario, MESI, nomeDipendente } from '../../../lib/turni'

function fmtBreve(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`
}

export default function Richieste() {
  const [changeReqs, setChangeReqs] = useState([])
  const [ferie, setFerie] = useState([])
  const [malattie, setMalattie] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(null) // id in elaborazione

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [scr, fer, mal] = await Promise.all([
      supabase.from('shift_change_requests')
        .select('*, dipendenti(nome,cognome), shifts(data,start_time,end_time)')
        .eq('stato', 'pending').order('created_at', { ascending: false }),
      supabase.from('leave_requests')
        .select('*, dipendenti(nome,cognome)')
        .eq('type', 'ferie').eq('stato', 'pending').order('created_at', { ascending: false }),
      supabase.from('leave_requests')
        .select('*, dipendenti(nome,cognome)')
        .eq('type', 'malattia').order('start_date', { ascending: false }).limit(50),
    ])
    if (scr.error) showToast('Errore: ' + scr.error.message, 'error')
    setChangeReqs(scr.data || [])
    setFerie(fer.data || [])
    setMalattie(mal.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function adminId() {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  }

  async function approvaModifica(req) {
    setBusy(req.id)
    // 1. aggiorna lo shift collegato con i nuovi orari (e data se presente)
    if (req.shift_id) {
      const upd = {
        start_time: req.requested_start,
        end_time: req.requested_end,
        updated_at: new Date().toISOString(),
      }
      if (req.requested_data) upd.data = req.requested_data
      const { error } = await supabase.from('shifts').update(upd).eq('id', req.shift_id)
      if (error) { showToast('Errore aggiornamento turno: ' + error.message, 'error'); setBusy(null); return }
    }
    // 2. segna la richiesta approvata
    const { error } = await supabase.from('shift_change_requests')
      .update({ stato: 'approved', resolved_at: new Date().toISOString(), resolved_by: await adminId() })
      .eq('id', req.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); setBusy(null); return }
    showToast('Modifica approvata, turno aggiornato')
    setBusy(null)
    fetchAll()
  }

  async function rifiutaModifica(req) {
    setBusy(req.id)
    const { error } = await supabase.from('shift_change_requests')
      .update({ stato: 'rejected', resolved_at: new Date().toISOString(), resolved_by: await adminId() })
      .eq('id', req.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); setBusy(null); return }
    showToast('Modifica rifiutata')
    setBusy(null)
    fetchAll()
  }

  async function risolviFerie(req, stato) {
    setBusy(req.id)
    const { error } = await supabase.from('leave_requests')
      .update({ stato, resolved_at: new Date().toISOString(), resolved_by: await adminId() })
      .eq('id', req.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); setBusy(null); return }
    showToast(stato === 'approved' ? 'Ferie approvate' : 'Ferie rifiutate')
    setBusy(null)
    fetchAll()
  }

  async function scaricaCertificato(path) {
    if (!path) { showToast('Nessun certificato', 'error'); return }
    const { data, error } = await supabase.storage.from('certificati').createSignedUrl(path, 60)
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#888', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 16 }}>Richieste</h2>

      {/* MODIFICHE ORARIO */}
      <Sezione titolo={`Modifiche orario in attesa (${changeReqs.length})`}>
        {changeReqs.length === 0
          ? <Vuoto testo="Nessuna richiesta di modifica in attesa." />
          : changeReqs.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeDipendente(r.dipendenti || {})}</div>
                  <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>
                    {fmtBreve(r.requested_data)}: {r.shifts ? fmtRangeOrario(r.shifts.start_time, r.shifts.end_time) : '—'}
                    {' '}→ <strong>{fmtRangeOrario(r.requested_start, r.requested_end)}</strong>
                  </div>
                  {r.motivo && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.motivo}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn-ghost" disabled={busy === r.id} onClick={() => rifiutaModifica(r)}>Rifiuta</button>
                  <button className="btn-primary" disabled={busy === r.id} onClick={() => approvaModifica(r)}>Approva</button>
                </div>
              </div>
            </div>
          ))}
      </Sezione>

      {/* FERIE */}
      <Sezione titolo={`Ferie in attesa (${ferie.length})`}>
        {ferie.length === 0
          ? <Vuoto testo="Nessuna richiesta di ferie in attesa." />
          : ferie.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeDipendente(r.dipendenti || {})}</div>
                  <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{fmtBreve(r.start_date)} – {fmtBreve(r.end_date)}</div>
                  {r.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn-ghost" disabled={busy === r.id} onClick={() => risolviFerie(r, 'rejected')}>Rifiuta</button>
                  <button className="btn-primary" disabled={busy === r.id} onClick={() => risolviFerie(r, 'approved')}>Approva</button>
                </div>
              </div>
            </div>
          ))}
      </Sezione>

      {/* MALATTIE */}
      <Sezione titolo={`Malattie (${malattie.length})`}>
        {malattie.length === 0
          ? <Vuoto testo="Nessuna malattia registrata." />
          : malattie.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeDipendente(r.dipendenti || {})}</div>
                  <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{fmtBreve(r.start_date)} – {fmtBreve(r.end_date)}</div>
                  {r.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.note}</div>}
                </div>
                <button className="btn-ghost" onClick={() => scaricaCertificato(r.certificate_url)}>Certificato</button>
              </div>
            </div>
          ))}
      </Sezione>
    </div>
  )
}

function Sezione({ titolo, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 8 }}>{titolo}</div>
      {children}
    </div>
  )
}

function Vuoto({ testo }) {
  return <div className="card" style={{ color: '#888', fontSize: 13 }}>{testo}</div>
}
