import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default function NuovoOspite() {
  const navigate = useNavigate()
  const [tipi, setTipi] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({
    name: '', surname: '', phone: '', username: '', password: '', type: 'single',
  })
  const [subPrincipale, setSubPrincipale] = useState({ subscription_type_id: '', paid_amount: '' })
  const [membri, setMembri] = useState([])
  const [nuovoMembro, setNuovoMembro] = useState({ name: '', surname: '', subscription_type_id: '', paid_amount: '' })

  useEffect(() => { fetchTipi() }, [])

  useEffect(() => {
    if (form.name && form.surname) {
      const base = `${form.name.toLowerCase().trim()}.${form.surname.toLowerCase().trim()}`
        .replace(/\s+/g, '').replace(/[^a-z0-9.]/g, '')
      setForm(f => ({ ...f, username: base }))
    }
  }, [form.name, form.surname])

  async function fetchTipi() {
    const { data } = await supabase.from('subscription_types').select('*').order('price')
    setTipi(data || [])
  }

  function aggiungiMembro() {
    if (!nuovoMembro.name || !nuovoMembro.surname) return
    setMembri(m => [...m, { ...nuovoMembro, id: Date.now() }])
    setNuovoMembro({ name: '', surname: '', subscription_type_id: '', paid_amount: '' })
  }

  function rimuoviMembro(id) { setMembri(m => m.filter(x => x.id !== id)) }

  async function salva() {
    if (!form.name || !form.surname || !form.username || !form.password) {
      showToast('Compila tutti i campi obbligatori', 'error'); return
    }
    if (form.password.length < 6) {
      showToast('La password deve essere di almeno 6 caratteri', 'error'); return
    }
    setSaving(true)

    const email = `${form.username}@asc-coworking.internal`

    // 1. Crea utente con supabaseAdmin (service role)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: form.password,
      email_confirm: true,
      user_metadata: { role: 'guest' },
    })

    if (authError) {
      showToast('Errore creazione utente: ' + authError.message, 'error')
      setSaving(false)
      return
    }

    const userId = authData.user.id

    // 2. Inserisci profilo
   const { error: profileError } = await supabase.from('profiles').insert({
  id: userId,
  username: form.username,
  email,
  role: 'guest',
})

    if (profileError) {
      showToast('Errore profilo: ' + profileError.message, 'error')
      setSaving(false)
      return
    }

    // 3. Crea account
    const { data: account, error: accError } = await supabase.from('accounts').insert({
      owner_id: userId,
      name: form.name,
      surname: form.surname,
      phone: form.phone,
      username: form.username,
      type: form.type,
    }).select().single()

    if (accError) {
      showToast('Errore account: ' + accError.message, 'error')
      setSaving(false)
      return
    }

    // 4. Crea membro principale
    const { data: membroPrincipale } = await supabase.from('members').insert({
      account_id: account.id,
      name: form.name,
      surname: form.surname,
    }).select().single()

    // 5. Abbonamento membro principale
    if (subPrincipale.subscription_type_id) {
      const tipo = tipi.find(t => t.id === subPrincipale.subscription_type_id)
      await supabase.from('subscriptions').insert({
        member_id: membroPrincipale.id,
        subscription_type_id: subPrincipale.subscription_type_id,
        entries_total: tipo.entries_total,
        entries_used: 0,
        paid_amount: parseFloat(subPrincipale.paid_amount) || tipo.price,
        active: true,
      })
    }

    // 6. Membri familiari
    for (const m of membri) {
      const { data: membroNew } = await supabase.from('members').insert({
        account_id: account.id,
        name: m.name,
        surname: m.surname,
      }).select().single()

      if (m.subscription_type_id) {
        const tipo = tipi.find(t => t.id === m.subscription_type_id)
        await supabase.from('subscriptions').insert({
          member_id: membroNew.id,
          subscription_type_id: m.subscription_type_id,
          entries_total: tipo.entries_total,
          entries_used: 0,
          expiry_date: m.expiry_date,
          paid_amount: parseFloat(m.paid_amount) || tipo.price,
          active: true,
        })
      }
    }

    showToast('Ospite salvato con successo!')
    setTimeout(() => navigate('/admin/ospiti'), 1500)
    setSaving(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function tipoLabel(id) {
    const t = tipi.find(x => x.id === id)
    return t ? `${t.name} — ${t.entries_total} ingressi · € ${t.price}` : ''
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn-ghost" onClick={() => navigate('/admin/ospiti')}>← Indietro</button>
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Nuovo ospite</h2>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={styles.sectionTitle}>Dati account principale</div>
        <div style={styles.grid2}>
          <div className="field">
            <label>Nome *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="es. Marco" />
          </div>
          <div className="field">
            <label>Cognome *</label>
            <input value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))} placeholder="es. Rossi" />
          </div>
          <div className="field">
            <label>Telefono</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+39 338..." />
          </div>
          <div className="field">
            <label>Nome utente *</label>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="marco.rossi" />
            <div className="hint">Generato automaticamente, modificabile</div>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Password *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimo 6 caratteri" />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Tipo account</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['single', 'family'].map(t => (
                <div key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: `0.5px solid ${form.type === t ? '#F5C842' : '#ccc'}`,
                  background: form.type === t ? '#FAEEDA' : '#fff',
                  color: form.type === t ? '#854F0B' : '#888',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: form.type === t ? 500 : 400,
                }}>
                  {t === 'single' ? 'Singolo' : 'Familiare'}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={styles.sectionTitle}>Abbonamento — {form.name || 'ospite principale'}</div>
        <div style={styles.grid2}>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Tipo abbonamento</label>
            <select value={subPrincipale.subscription_type_id} onChange={e => {
              const tipo = tipi.find(t => t.id === e.target.value)
              setSubPrincipale(s => ({ ...s, subscription_type_id: e.target.value, paid_amount: tipo?.price || '' }))
            }}>
              <option value="">Seleziona...</option>
              {tipi.map(t => <option key={t.id} value={t.id}>{t.name} — {t.entries_total} ingressi · € {t.price}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Importo pagato (€)</label>
            <input type="number" placeholder="es. 360" value={subPrincipale.paid_amount}
              onChange={e => setSubPrincipale(s => ({ ...s, paid_amount: e.target.value }))} />
            <div className="hint">Popola il fatturato</div>
          </div>
        </div>
      </div>

      {form.type === 'family' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={styles.sectionTitle}>Membri familiari</div>
          {membri.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name} {m.surname}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{tipoLabel(m.subscription_type_id)}</div>
              </div>
              <button className="btn-danger" onClick={() => rimuoviMembro(m.id)}>Rimuovi</button>
            </div>
          ))}
          <div style={{ borderTop: membri.length ? '0.5px solid #eee' : 'none', paddingTop: membri.length ? 14 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 10 }}>Aggiungi membro</div>
            <div style={styles.grid2}>
              <div className="field"><label>Nome</label><input value={nuovoMembro.name} onChange={e => setNuovoMembro(m => ({ ...m, name: e.target.value }))} placeholder="es. Luca" /></div>
              <div className="field"><label>Cognome</label><input value={nuovoMembro.surname} onChange={e => setNuovoMembro(m => ({ ...m, surname: e.target.value }))} placeholder="es. Rossi" /></div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Tipo abbonamento</label>
                <select value={nuovoMembro.subscription_type_id} onChange={e => {
                  const tipo = tipi.find(t => t.id === e.target.value)
                  setNuovoMembro(m => ({ ...m, subscription_type_id: e.target.value, paid_amount: tipo?.price || '' }))
                }}>
                  <option value="">Seleziona...</option>
                  {tipi.map(t => <option key={t.id} value={t.id}>{t.name} — {t.entries_total} ingressi · € {t.price}</option>)}
                </select>
              </div>
              <div className="field"><label>Importo pagato (€)</label><input type="number" value={nuovoMembro.paid_amount} onChange={e => setNuovoMembro(m => ({ ...m, paid_amount: e.target.value }))} /></div>
            </div>
            <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={aggiungiMembro}>+ Aggiungi membro</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={() => navigate('/admin/ospiti')}>Annulla</button>
        <button className="btn-primary" onClick={salva} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva ospite'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 500, marginBottom: 14, paddingBottom: 10, borderBottom: '0.5px solid #eee' },
}
