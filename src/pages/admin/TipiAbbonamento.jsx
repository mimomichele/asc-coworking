import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const emptyForm = {
  name: '',
  kind: 'entries',          // 'entries' = a scalare · 'time' = a tempo (Netflix)
  entries_total: '',
  duration_months: '',
  price: '',
}

export default function TipiAbbonamento() {
  const [tipi, setTipi] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { fetchTipi() }, [])

  async function fetchTipi() {
    const { data } = await supabase.from('subscription_types').select('*').order('price')
    setTipi(data || [])
  }

  async function salva() {
    if (!form.name.trim()) { showToast('Inserisci il nome', 'error'); return }
    if (!form.price) { showToast('Inserisci il prezzo', 'error'); return }

    if (form.kind === 'entries' && !form.entries_total) {
      showToast('Inserisci il numero di ingressi', 'error'); return
    }
    if (form.kind === 'time' && !form.duration_months) {
      showToast('Inserisci la durata in mesi', 'error'); return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      // entries_total e' NOT NULL nel DB: per 'time' lo settiamo a 0.
      entries_total: form.kind === 'entries' ? parseInt(form.entries_total, 10) : 0,
      duration_months: form.duration_months ? parseInt(form.duration_months, 10) : null,
      price: parseFloat(form.price),
    }
    const { error } = await supabase.from('subscription_types').insert(payload)
    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast('Abbonamento salvato')
    setForm(emptyForm)
    setShowForm(false)
    fetchTipi()
    setSaving(false)
  }

  async function elimina(id) {
    if (!confirm('Eliminare questo tipo di abbonamento?')) return
    const { error } = await supabase.from('subscription_types').delete().eq('id', id)
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    fetchTipi()
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function dettaglio(t) {
    if (t.kind === 'time') {
      return t.duration_months ? `${t.duration_months} mes${t.duration_months === 1 ? 'e' : 'i'} illimitati` : 'a tempo'
    }
    const ing = `${t.entries_total} ingress${t.entries_total === 1 ? 'o' : 'i'}`
    return t.duration_months ? `${ing} · ${t.duration_months} mes${t.duration_months === 1 ? 'e' : 'i'}` : ing
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Tipi di abbonamento</h2>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Chiudi' : '+ Nuovo tipo'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Nuovo tipo di abbonamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Nome abbonamento</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="es. Standard — 10 ingressi"
              />
            </div>

            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Tipo</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 'entries', label: 'A ingressi', hint: 'scala 1 ingresso per camera/giorno' },
                  { value: 'time',    label: 'A tempo',    hint: 'accesso illimitato nella durata (Netflix)' },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, kind: opt.value }))}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8,
                      border: `0.5px solid ${form.kind === opt.value ? '#F5C842' : '#ccc'}`,
                      background: form.kind === opt.value ? '#FAEEDA' : '#fff',
                      color: form.kind === opt.value ? '#854F0B' : '#888',
                      cursor: 'pointer', fontSize: 13,
                      fontWeight: form.kind === opt.value ? 500 : 400,
                    }}
                  >
                    <div>{opt.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{opt.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            {form.kind === 'entries' && (
              <div className="field">
                <label>Ingressi *</label>
                <input
                  type="number" min="1"
                  value={form.entries_total}
                  onChange={e => setForm(f => ({ ...f, entries_total: e.target.value }))}
                  placeholder="es. 10"
                />
                <div className="hint">1 ingresso = 1 camera/giorno</div>
              </div>
            )}

            <div className="field">
              <label>Durata (mesi) {form.kind === 'time' ? '*' : ''}</label>
              <input
                type="number" min="1"
                value={form.duration_months}
                onChange={e => setForm(f => ({ ...f, duration_months: e.target.value }))}
                placeholder={form.kind === 'time' ? 'es. 6' : 'es. 6 (opzionale)'}
              />
              <div className="hint">
                {form.kind === 'time' ? 'Periodo di accesso illimitato' : 'Validita\' dell\'abbonamento'}
              </div>
            </div>

            <div className="field" style={{ gridColumn: form.kind === 'time' ? '1/-1' : 'auto' }}>
              <label>Prezzo (€) *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="es. 360"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setForm(emptyForm) }}>Annulla</button>
            <button className="btn-primary" onClick={salva} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '32%' }}>Nome</th>
              <th style={{ width: '14%' }}>Tipo</th>
              <th>Dettaglio</th>
              <th style={{ width: '14%' }}>Prezzo</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {tipi.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td>
                  <span className={`pill ${t.kind === 'time' ? 'pill-info' : 'pill-gray'}`}>
                    {t.kind === 'time' ? 'A tempo' : 'A ingressi'}
                  </span>
                </td>
                <td style={{ fontSize: 13 }}>{dettaglio(t)}</td>
                <td style={{ fontWeight: 500 }}>€ {Number(t.price).toLocaleString('it-IT')}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-danger" onClick={() => elimina(t.id)}>Elimina</button>
                </td>
              </tr>
            ))}
            {tipi.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 20 }}>
                  Nessun tipo di abbonamento
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
