import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fmtRangeOrario } from '../../../lib/turni'

const emptyForm = { label: '', start_time: '08:00', end_time: '14:00', spezzato: false, start_time_2: '16:00', end_time_2: '20:00' }

export default function TurniPredefiniti() {
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    const { data, error } = await supabase
      .from('shift_templates').select('*').order('start_time')
    if (error) showToast('Errore caricamento: ' + error.message, 'error')
    setTemplates(data || [])
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(t) {
    const spezzato = !!(t.start_time_2 && t.end_time_2)
    setForm({
      label: t.label,
      start_time: (t.start_time || '').slice(0, 5),
      end_time: (t.end_time || '').slice(0, 5),
      spezzato,
      start_time_2: (t.start_time_2 || '16:00').slice(0, 5),
      end_time_2: (t.end_time_2 || '20:00').slice(0, 5),
    })
    setEditingId(t.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function salva() {
    if (!form.label.trim()) { showToast('Inserisci un nome per il turno', 'error'); return }
    if (!form.start_time || !form.end_time) { showToast('Inserisci entrata e uscita', 'error'); return }
    if (form.spezzato && (!form.start_time_2 || !form.end_time_2)) {
      showToast('Inserisci entrata e uscita della seconda fascia', 'error'); return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      label: form.label.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      start_time_2: form.spezzato ? form.start_time_2 : null,
      end_time_2: form.spezzato ? form.end_time_2 : null,
    }
    const { error } = editingId
      ? await supabase.from('shift_templates').update(payload).eq('id', editingId)
      : await supabase.from('shift_templates').insert({ ...payload, created_by: user?.id ?? null })

    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast(editingId ? 'Turno predefinito aggiornato' : 'Turno predefinito creato')
    closeForm()
    fetchTemplates()
    setSaving(false)
  }

  async function elimina(t) {
    const { error } = await supabase.from('shift_templates').delete().eq('id', t.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); setConfirmDelete(null); return }
    showToast('Turno predefinito eliminato')
    setConfirmDelete(null)
    fetchTemplates()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#888', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Turni predefiniti ({templates.length})</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            Orari riutilizzabili con un tap nel planner. Per uno spezzato crea due turni e applicali entrambi alla stessa giornata.
          </div>
        </div>
        {!showForm && <button className="btn-primary" onClick={openCreate}>+ Nuovo turno predefinito</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
            {editingId ? 'Modifica turno predefinito' : 'Nuovo turno predefinito'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Nome *</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="es. Mattina" />
            </div>
            <div className="field">
              <label>{form.spezzato ? 'Entrata 1 *' : 'Entrata *'}</label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="field">
              <label>{form.spezzato ? 'Uscita 1 *' : 'Uscita *'}</label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444', marginTop: 4, marginBottom: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.spezzato}
              onChange={e => setForm(f => ({ ...f, spezzato: e.target.checked }))}
            />
            Turno spezzato (due fasce)
          </label>

          {form.spezzato && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div />
              <div className="field">
                <label>Entrata 2 *</label>
                <input type="time" value={form.start_time_2} onChange={e => setForm(f => ({ ...f, start_time_2: e.target.value }))} />
              </div>
              <div className="field">
                <label>Uscita 2 *</label>
                <input type="time" value={form.end_time_2} onChange={e => setForm(f => ({ ...f, end_time_2: e.target.value }))} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={closeForm}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>
              {saving ? 'Salvataggio...' : editingId ? 'Salva modifiche' : 'Crea turno'}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina turno predefinito</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Stai per eliminare <strong>{confirmDelete.label}</strong>. I turni già assegnati non verranno toccati.
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
              <th style={{ width: '40%' }}>Nome</th>
              <th>Orario</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>
                  {t.label}
                  {t.start_time_2 && t.end_time_2 && (
                    <span className="pill pill-info" style={{ marginLeft: 8 }}>spezzato</span>
                  )}
                </td>
                <td>
                  <span className="pill pill-gray">{fmtRangeOrario(t.start_time, t.end_time)}</span>
                  {t.start_time_2 && t.end_time_2 && (
                    <span className="pill pill-gray" style={{ marginLeft: 6 }}>{fmtRangeOrario(t.start_time_2, t.end_time_2)}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => openEdit(t)}>Modifica</button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(t)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: '#888', textAlign: 'center', padding: 24 }}>
                  Nessun turno predefinito. Creane qualcuno per inserire i turni con un tap.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
