import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ROOM_TYPES = [
  { value: 'doppia',    label: 'Doppia',    capacity: 2 },
  { value: 'tripla',    label: 'Tripla',    capacity: 3 },
  { value: 'quadrupla', label: 'Quadrupla', capacity: 4 },
]

const emptyForm = { name: '', room_type: 'quadrupla', capacity: 4, active: true, notes: '' }

export default function Camere() {
  const [rooms, setRooms] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchRooms() }, [])

  async function fetchRooms() {
    const { data, error } = await supabase.from('rooms').select('*').order('name')
    if (error) showToast('Errore caricamento: ' + error.message, 'error')
    setRooms(data || [])
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(room) {
    setForm({
      name: room.name,
      room_type: room.room_type,
      capacity: room.capacity,
      active: room.active,
      notes: room.notes || '',
    })
    setEditingId(room.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function onTypeChange(value) {
    const t = ROOM_TYPES.find(x => x.value === value)
    setForm(f => ({ ...f, room_type: value, capacity: t?.capacity ?? f.capacity }))
  }

  async function salva() {
    if (!form.name.trim()) { showToast('Inserisci il nome della camera', 'error'); return }
    const cap = parseInt(form.capacity, 10)
    if (!cap || cap < 1) { showToast('Capacità non valida', 'error'); return }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      room_type: form.room_type,
      capacity: cap,
      active: !!form.active,
      notes: form.notes.trim() || null,
    }

    const { error } = editingId
      ? await supabase.from('rooms').update(payload).eq('id', editingId)
      : await supabase.from('rooms').insert(payload)

    if (error) {
      showToast('Errore: ' + error.message, 'error')
      setSaving(false)
      return
    }
    showToast(editingId ? 'Camera aggiornata' : 'Camera creata')
    closeForm()
    fetchRooms()
    setSaving(false)
  }

  async function toggleActive(room) {
    const { error } = await supabase.from('rooms').update({ active: !room.active }).eq('id', room.id)
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    fetchRooms()
  }

  async function elimina(room) {
    const { error } = await supabase.from('rooms').delete().eq('id', room.id)
    if (error) {
      showToast('Errore: ' + error.message + ' — prova a disattivarla.', 'error')
      setConfirmDelete(null)
      return
    }
    showToast('Camera eliminata')
    setConfirmDelete(null)
    fetchRooms()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  const attive = rooms.filter(r => r.active).length
  const disattivate = rooms.length - attive

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Camere ({rooms.length})</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {attive} attiv{attive === 1 ? 'a' : 'e'} · {disattivate} disattivat{disattivate === 1 ? 'a' : 'e'}
          </div>
        </div>
        {!showForm && (
          <button className="btn-primary" onClick={openCreate}>+ Nuova camera</button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
            {editingId ? 'Modifica camera' : 'Nuova camera'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Nome *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="es. Camera 101"
              />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select value={form.room_type} onChange={e => onTypeChange(e.target.value)}>
                {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Capacità *</label>
              <input
                type="number" min="1" max="10"
                value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              />
              <div className="hint">Posti letto reali (tetto del nucleo)</div>
            </div>
            <div className="field">
              <label>Stato</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[true, false].map(v => (
                  <div
                    key={String(v)}
                    onClick={() => setForm(f => ({ ...f, active: v }))}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: `0.5px solid ${form.active === v ? '#F5C842' : '#ccc'}`,
                      background: form.active === v ? '#FAEEDA' : '#fff',
                      color: form.active === v ? '#854F0B' : '#888',
                      cursor: 'pointer', fontSize: 13,
                      fontWeight: form.active === v ? 500 : 400,
                    }}
                  >
                    {v ? 'Attiva' : 'Disattivata'}
                  </div>
                ))}
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Note</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="es. piano terra, vista giardino"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={closeForm}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>
              {saving ? 'Salvataggio...' : editingId ? 'Salva modifiche' : 'Crea camera'}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina camera</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Stai per eliminare <strong>{confirmDelete.name}</strong>. Se ci sono prenotazioni
              collegate l'eliminazione fallirà — in alternativa puoi disattivarla.
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
              <th style={{ width: '22%' }}>Nome</th>
              <th style={{ width: '14%' }}>Tipo</th>
              <th style={{ width: '12%' }}>Capacità</th>
              <th style={{ width: '14%' }}>Stato</th>
              <th>Note</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td>
                  <span className="pill pill-gray">
                    {ROOM_TYPES.find(t => t.value === r.room_type)?.label || r.room_type}
                  </span>
                </td>
                <td>{r.capacity}</td>
                <td>
                  <span className={`pill ${r.active ? 'pill-ok' : 'pill-gray'}`}>
                    {r.active ? 'Attiva' : 'Disattivata'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#888' }}>{r.notes || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => toggleActive(r)}>
                      {r.active ? 'Disattiva' : 'Attiva'}
                    </button>
                    <button className="btn-ghost" onClick={() => openEdit(r)}>Modifica</button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(r)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: '#888', textAlign: 'center', padding: 24 }}>
                  Nessuna camera. Aggiungi la prima per iniziare.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
