import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

const emptyForm = { nome: '', cognome: '', ruolo: '', attivo: true }

export default function Dipendenti() {
  const [dipendenti, setDipendenti] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchDipendenti() }, [])

  async function fetchDipendenti() {
    const { data, error } = await supabase
      .from('dipendenti').select('*').order('ordine', { nullsFirst: false }).order('cognome').order('nome')
    if (error) showToast('Errore caricamento: ' + error.message, 'error')
    setDipendenti(data || [])
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(d) {
    setForm({ nome: d.nome, cognome: d.cognome || '', ruolo: d.ruolo || '', attivo: d.attivo })
    setEditingId(d.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function salva() {
    if (!form.nome.trim()) { showToast('Inserisci il nome', 'error'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      cognome: form.cognome.trim() || null,
      ruolo: form.ruolo.trim() || null,
      attivo: !!form.attivo,
    }
    const { error } = editingId
      ? await supabase.from('dipendenti').update(payload).eq('id', editingId)
      : await supabase.from('dipendenti').insert(payload)

    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast(editingId ? 'Dipendente aggiornato' : 'Dipendente creato')
    closeForm()
    fetchDipendenti()
    setSaving(false)
  }

  async function toggleActive(d) {
    const { error } = await supabase.from('dipendenti').update({ attivo: !d.attivo }).eq('id', d.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    fetchDipendenti()
  }

  async function elimina(d) {
    const { error } = await supabase.from('dipendenti').delete().eq('id', d.id)
    if (error) {
      showToast('Errore: ' + error.message + ' — prova a disattivarlo.', 'error')
      setConfirmDelete(null)
      return
    }
    showToast('Dipendente eliminato')
    setConfirmDelete(null)
    fetchDipendenti()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  const attivi = dipendenti.filter(d => d.attivo).length
  const disattivi = dipendenti.length - attivi

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#888', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Dipendenti ({dipendenti.length})</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {attivi} attiv{attivi === 1 ? 'o' : 'i'} · {disattivi} disattivat{disattivi === 1 ? 'o' : 'i'}
          </div>
        </div>
        {!showForm && <button className="btn-primary" onClick={openCreate}>+ Nuovo dipendente</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
            {editingId ? 'Modifica dipendente' : 'Nuovo dipendente'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Nome *</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="es. Marco" />
            </div>
            <div className="field">
              <label>Cognome</label>
              <input value={form.cognome} onChange={e => setForm(f => ({ ...f, cognome: e.target.value }))} placeholder="es. Rossi" />
            </div>
            <div className="field">
              <label>Ruolo</label>
              <input value={form.ruolo} onChange={e => setForm(f => ({ ...f, ruolo: e.target.value }))} placeholder="es. Bagnino, Reception" />
            </div>
            <div className="field">
              <label>Stato</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[true, false].map(v => (
                  <div
                    key={String(v)}
                    onClick={() => setForm(f => ({ ...f, attivo: v }))}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: `0.5px solid ${form.attivo === v ? '#F5C842' : '#ccc'}`,
                      background: form.attivo === v ? '#FAEEDA' : '#fff',
                      color: form.attivo === v ? '#854F0B' : '#888',
                      cursor: 'pointer', fontSize: 13, fontWeight: form.attivo === v ? 500 : 400,
                    }}
                  >
                    {v ? 'Attivo' : 'Disattivato'}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={closeForm}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>
              {saving ? 'Salvataggio...' : editingId ? 'Salva modifiche' : 'Crea dipendente'}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina dipendente</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Stai per eliminare <strong>{confirmDelete.nome} {confirmDelete.cognome || ''}</strong>.
              Verranno eliminati anche tutti i suoi turni. In alternativa puoi disattivarlo.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Annulla</button>
              <button
                style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                onClick={() => elimina(confirmDelete)}
              >
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Nome</th>
              <th style={{ width: '24%' }}>Cognome</th>
              <th>Ruolo</th>
              <th style={{ width: '14%' }}>Stato</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {dipendenti.map(d => (
              <tr key={d.id} style={{ opacity: d.attivo ? 1 : 0.5 }}>
                <td style={{ fontWeight: 500 }}>{d.nome}</td>
                <td>{d.cognome || '—'}</td>
                <td style={{ fontSize: 12, color: '#888' }}>{d.ruolo || '—'}</td>
                <td>
                  <span className={`pill ${d.attivo ? 'pill-ok' : 'pill-gray'}`}>
                    {d.attivo ? 'Attivo' : 'Disattivato'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => toggleActive(d)}>{d.attivo ? 'Disattiva' : 'Attiva'}</button>
                    <button className="btn-ghost" onClick={() => openEdit(d)}>Modifica</button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(d)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {dipendenti.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 24 }}>
                  Nessun dipendente. Aggiungi il primo per iniziare a inserire i turni.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
