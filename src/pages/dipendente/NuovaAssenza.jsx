import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { oggiStr } from '../../lib/turni'

export default function NuovaAssenza({ dipendente }) {
  const [tab, setTab] = useState('ferie') // 'ferie' | 'malattia'
  const [toast, setToast] = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Assenze</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['ferie', 'Ferie'], ['malattia', 'Malattia']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, cursor: 'pointer',
              border: `0.5px solid ${tab === k ? '#F5C842' : '#ddd'}`,
              background: tab === k ? '#FAEEDA' : '#fff',
              color: tab === k ? '#854F0B' : '#888', fontWeight: tab === k ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ferie'
        ? <FerieForm dipendente={dipendente} onToast={showToast} />
        : <MalattiaForm dipendente={dipendente} onToast={showToast} />}
    </div>
  )
}

function FerieForm({ dipendente, onToast }) {
  const [start, setStart] = useState(oggiStr())
  const [end, setEnd] = useState(oggiStr())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function invia() {
    if (!start || !end) { onToast('Inserisci le date', 'error'); return }
    if (end < start) { onToast('La data fine non può precedere la data inizio', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('leave_requests').insert({
      dipendente_id: dipendente.id,
      type: 'ferie',
      start_date: start,
      end_date: end,
      note: note.trim() || null,
      stato: 'pending',
    })
    if (error) { onToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    onToast('Richiesta ferie inviata, in attesa di approvazione')
    setNote('')
    setSaving(false)
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
        La richiesta di ferie va approvata dall'amministrazione.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Dal</label><input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label>Al</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div className="field"><label>Nota (facoltativo)</label><input value={note} onChange={e => setNote(e.target.value)} /></div>
      <button className="btn-primary" onClick={invia} disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Invio...' : 'Invia richiesta ferie'}
      </button>
    </div>
  )
}

function MalattiaForm({ dipendente, onToast }) {
  const [start, setStart] = useState(oggiStr())
  const [end, setEnd] = useState(oggiStr())
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  async function invia() {
    if (!start || !end) { onToast('Inserisci le date', 'error'); return }
    if (end < start) { onToast('La data fine non può precedere la data inizio', 'error'); return }
    if (!file) { onToast('Il certificato è obbligatorio', 'error'); return }

    setSaving(true)
    // id generato lato client → path noto prima dell'upload (RLS insert-only,
    // niente update successivo). cert/<dipendente_id>/<id>.<ext>
    const id = crypto.randomUUID()
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
    const path = `cert/${dipendente.id}/${id}.${ext}`

    const { error: upErr } = await supabase.storage.from('certificati').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (upErr) { onToast('Errore upload certificato: ' + upErr.message, 'error'); setSaving(false); return }

    const { error } = await supabase.from('leave_requests').insert({
      id,
      dipendente_id: dipendente.id,
      type: 'malattia',
      start_date: start,
      end_date: end,
      note: note.trim() || null,
      certificate_url: path,
      stato: 'approved',
    })
    if (error) {
      // rollback best-effort del file caricato
      await supabase.storage.from('certificati').remove([path])
      onToast('Errore: ' + error.message, 'error'); setSaving(false); return
    }
    onToast('Malattia registrata con certificato')
    setNote(''); setFile(null)
    setSaving(false)
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
        Inserimento diretto. Il certificato (PDF o immagine) è obbligatorio ed è visibile solo all'amministrazione.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Dal</label><input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label>Al</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Certificato *</label>
        <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
      </div>
      <div className="field"><label>Nota (facoltativo)</label><input value={note} onChange={e => setNote(e.target.value)} /></div>
      <button className="btn-primary" onClick={invia} disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Invio...' : 'Registra malattia'}
      </button>
    </div>
  )
}
