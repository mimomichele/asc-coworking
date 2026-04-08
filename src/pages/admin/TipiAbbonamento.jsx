import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TipiAbbonamento() {
  const [tipi, setTipi] = useState([])
  const [form, setForm] = useState({ name: '', entries_total: '', duration_months: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { fetchTipi() }, [])

  async function fetchTipi() {
    const { data } = await supabase.from('subscription_types').select('*').order('price')
    setTipi(data || [])
  }

  async function salva() {
    if (!form.name || !form.entries_total || !form.price) { showToast('Compila tutti i campi', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('subscription_types').insert({
      name: form.name,
      entries_total: parseInt(form.entries_total),

      price: parseFloat(form.price),
    })
    if (error) { showToast('Errore nel salvataggio', 'error'); setSaving(false); return }
    showToast('Abbonamento salvato')
    setForm({ name: '', entries_total: '', duration_months: '', price: '' })
    setShowForm(false)
    fetchTipi()
    setSaving(false)
  }

  async function elimina(id) {
    if (!confirm('Eliminare questo tipo di abbonamento?')) return
    await supabase.from('subscription_types').delete().eq('id', id)
    fetchTipi()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Tipi di abbonamento</h2>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Chiudi' : '+ Nuovo tipo'}</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Nuovo tipo di abbonamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Nome abbonamento</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="es. Standard — 10 ingressi" /></div>
            <div className="field"><label>Ingressi</label><input type="number" value={form.entries_total} onChange={e => setForm(f => ({ ...f, entries_total: e.target.value }))} placeholder="es. 10" /></div>

            <div className="field"><label>Prezzo (€)</label><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="es. 360" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ingressi</th>

              <th>Prezzo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tipi.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td>{t.entries_total}</td>

                <td style={{ fontWeight: 500 }}>€ {t.price.toLocaleString('it-IT')}</td>
                <td><button className="btn-danger" onClick={() => elimina(t.id)}>Elimina</button></td>
              </tr>
            ))}
            {tipi.length === 0 && <tr><td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 20 }}>Nessun tipo di abbonamento</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
