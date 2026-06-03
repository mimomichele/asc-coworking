import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

const emptyForm = { nome: '', colore: '#1F4E78', icona: 'ti-folder', ordine: 0, attiva: true }

export default function CategorieCompliance() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchRows() }, [])

  async function fetchRows() {
    const { data, error } = await supabase.from('compliance_categories').select('*').order('ordine').order('nome')
    if (error) showToast('Errore: ' + error.message, 'error')
    setRows(data || [])
    setLoading(false)
  }

  function openCreate() { setForm(emptyForm); setEditingId(null); setShowForm(true) }
  function openEdit(r) {
    setForm({ nome: r.nome, colore: r.colore || '#1F4E78', icona: r.icona || '', ordine: r.ordine ?? 0, attiva: r.attiva })
    setEditingId(r.id); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm) }

  async function salva() {
    if (!form.nome.trim()) { showToast('Inserisci il nome', 'error'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(), colore: form.colore, icona: form.icona.trim() || null,
      ordine: parseInt(form.ordine, 10) || 0, attiva: !!form.attiva,
    }
    const { error } = editingId
      ? await supabase.from('compliance_categories').update(payload).eq('id', editingId)
      : await supabase.from('compliance_categories').insert(payload)
    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast(editingId ? 'Categoria aggiornata' : 'Categoria creata')
    closeForm(); fetchRows(); setSaving(false)
  }

  async function elimina(r) {
    const { error } = await supabase.from('compliance_categories').delete().eq('id', r.id)
    if (error) { showToast('Impossibile eliminare (forse usata da adempimenti): ' + error.message, 'error'); setConfirmDelete(null); return }
    showToast('Categoria eliminata'); setConfirmDelete(null); fetchRows()
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/compliance" style={{ color: '#888', textDecoration: 'none' }}>← Scadenziario</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Categorie ({rows.length})</h2>
        {!showForm && <button className="btn-primary" onClick={openCreate}>+ Nuova categoria</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>{editingId ? 'Modifica categoria' : 'Nuova categoria'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field"><label>Nome *</label><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div className="field"><label>Colore</label><input type="color" value={form.colore} onChange={e => setForm(f => ({ ...f, colore: e.target.value }))} style={{ height: 38, padding: 2 }} /></div>
            <div className="field"><label>Ordine</label><input type="number" value={form.ordine} onChange={e => setForm(f => ({ ...f, ordine: e.target.value }))} /></div>
            <div className="field"><label>Icona (testo)</label><input value={form.icona} onChange={e => setForm(f => ({ ...f, icona: e.target.value }))} placeholder="es. ti-flame" /></div>
            <div className="field">
              <label>Stato</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[true, false].map(v => (
                  <div key={String(v)} onClick={() => setForm(f => ({ ...f, attiva: v }))} style={{
                    padding: '8px 16px', borderRadius: 8, border: `0.5px solid ${form.attiva === v ? '#F5C842' : '#ccc'}`,
                    background: form.attiva === v ? '#FAEEDA' : '#fff', color: form.attiva === v ? '#854F0B' : '#888',
                    cursor: 'pointer', fontSize: 13,
                  }}>{v ? 'Attiva' : 'Disattivata'}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={closeForm}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : editingId ? 'Salva' : 'Crea'}</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina categoria</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Elimina <strong>{confirmDelete.nome}</strong>? Se è usata da adempimenti l'operazione fallirà.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Annulla</button>
              <button style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={() => elimina(confirmDelete)}>Sì, elimina</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 40 }}></th><th>Nome</th><th style={{ width: 90 }}>Ordine</th><th style={{ width: 120 }}>Stato</th><th style={{ width: 160 }}></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ opacity: r.attiva ? 1 : 0.5 }}>
                <td><span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: r.colore || '#ccc' }} /></td>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td>{r.ordine}</td>
                <td><span className={`pill ${r.attiva ? 'pill-ok' : 'pill-gray'}`}>{r.attiva ? 'Attiva' : 'Disattivata'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => openEdit(r)}>Modifica</button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(r)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 24 }}>Nessuna categoria.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
