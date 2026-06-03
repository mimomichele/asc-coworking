import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

const emptyForm = { nome: '', contatto_referente: '', email: '', telefono: '', note: '', attivo: true }

export default function FornitoriCompliance() {
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
    const { data, error } = await supabase.from('compliance_fornitori').select('*').order('nome')
    if (error) showToast('Errore: ' + error.message, 'error')
    setRows(data || [])
    setLoading(false)
  }

  function openCreate() { setForm(emptyForm); setEditingId(null); setShowForm(true) }
  function openEdit(r) {
    setForm({
      nome: r.nome, contatto_referente: r.contatto_referente || '', email: r.email || '',
      telefono: r.telefono || '', note: r.note || '', attivo: r.attivo,
    })
    setEditingId(r.id); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm) }

  async function salva() {
    if (!form.nome.trim()) { showToast('Inserisci il nome', 'error'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      contatto_referente: form.contatto_referente.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      note: form.note.trim() || null,
      attivo: !!form.attivo,
    }
    const { error } = editingId
      ? await supabase.from('compliance_fornitori').update(payload).eq('id', editingId)
      : await supabase.from('compliance_fornitori').insert(payload)
    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast(editingId ? 'Fornitore aggiornato' : 'Fornitore creato')
    closeForm(); fetchRows(); setSaving(false)
  }

  async function elimina(r) {
    const { error } = await supabase.from('compliance_fornitori').delete().eq('id', r.id)
    if (error) { showToast('Impossibile eliminare (forse collegato): ' + error.message, 'error'); setConfirmDelete(null); return }
    showToast('Fornitore eliminato'); setConfirmDelete(null); fetchRows()
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
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Fornitori ({rows.length})</h2>
        {!showForm && <button className="btn-primary" onClick={openCreate}>+ Nuovo fornitore</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>{editingId ? 'Modifica fornitore' : 'Nuovo fornitore'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Nome *</label><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div className="field"><label>Referente</label><input value={form.contatto_referente} onChange={e => setForm(f => ({ ...f, contatto_referente: e.target.value }))} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="field"><label>Telefono</label><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div className="field">
              <label>Stato</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[true, false].map(v => (
                  <div key={String(v)} onClick={() => setForm(f => ({ ...f, attivo: v }))} style={{
                    padding: '8px 16px', borderRadius: 8, border: `0.5px solid ${form.attivo === v ? '#F5C842' : '#ccc'}`,
                    background: form.attivo === v ? '#FAEEDA' : '#fff', color: form.attivo === v ? '#854F0B' : '#888',
                    cursor: 'pointer', fontSize: 13,
                  }}>{v ? 'Attivo' : 'Disattivato'}</div>
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
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina fornitore</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Elimina <strong>{confirmDelete.nome}</strong>?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Annulla</button>
              <button style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={() => elimina(confirmDelete)}>Sì, elimina</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Referente</th><th>Contatti</th><th style={{ width: 110 }}>Stato</th><th style={{ width: 160 }}></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ opacity: r.attivo ? 1 : 0.5 }}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td style={{ fontSize: 12, color: '#888' }}>{r.contatto_referente || '—'}</td>
                <td style={{ fontSize: 12, color: '#888' }}>{[r.email, r.telefono].filter(Boolean).join(' · ') || '—'}</td>
                <td><span className={`pill ${r.attivo ? 'pill-ok' : 'pill-gray'}`}>{r.attivo ? 'Attivo' : 'Disattivato'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => openEdit(r)}>Modifica</button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(r)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 24 }}>Nessun fornitore.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
