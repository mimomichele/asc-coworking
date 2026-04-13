import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default function SchedaOspite() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [tipiAbb, setTipiAbb] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showNuovoMembro, setShowNuovoMembro] = useState(false)
  const [form, setForm] = useState({ subscription_type_id: '', paid_amount: '' })
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', username: '', type: '', newPassword: '' })
  const [nuovoMembroForm, setNuovoMembroForm] = useState({ name: '', surname: '', subscription_type_id: '', paid_amount: '' })
  const [saving, setSaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingMembro, setSavingMembro] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData(); fetchTipi() }, [id])

  async function fetchData() {
    const { data: acc } = await supabase.from('accounts').select('*').eq('id', id).single()
    const { data: mems } = await supabase
      .from('members')
      .select(`*, subscriptions(*, subscription_types(name, entries_total, price)), bookings(date, status, created_at)`)
      .eq('account_id', id)
      .order('created_at')
    setAccount(acc)
    setEditForm({
      name: acc?.name || '',
      surname: acc?.surname || '',
      phone: acc?.phone || '',
      username: acc?.username || '',
      type: acc?.type || 'single',
      newPassword: '',
    })
    setMembers(mems || [])
    if (mems?.length && !selectedMember) setSelectedMember(mems[0].id)
    setLoading(false)
  }

  async function fetchTipi() {
    const { data } = await supabase.from('subscription_types').select('*').order('price')
    setTipiAbb(data || [])
  }

  async function deleteAccount() {
    try {
      // Elimina utente auth (cascade elimina tutto il resto)
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('username', account.username).single()
      if (profile) {
        await supabaseAdmin.auth.admin.deleteUser(profile.id)
      }
      // Elimina account (cascade su members, subscriptions, bookings)
      await supabase.from('accounts').delete().eq('id', id)
      navigate('/admin/ospiti')
    } catch (e) {
      showToast('Errore durante eliminazione: ' + e.message, 'error')
    }
  }

  async function saveEdit() {
    if (!editForm.name || !editForm.surname || !editForm.username) {
      showToast('Compila tutti i campi obbligatori', 'error'); return
    }
    setSavingEdit(true)

    const { error } = await supabase.from('accounts').update({
      name: editForm.name,
      surname: editForm.surname,
      phone: editForm.phone,
      username: editForm.username,
      type: editForm.type,
    }).eq('id', id)

    if (error) {
      showToast('Errore nel salvataggio: ' + error.message, 'error')
      setSavingEdit(false)
      return
    }

    if (editForm.newPassword && editForm.newPassword.length >= 6) {
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('username', editForm.username).single()
      if (profile) {
        const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
          profile.id, { password: editForm.newPassword }
        )
        if (pwError) {
          showToast('Dati salvati ma errore cambio password: ' + pwError.message, 'error')
          setSavingEdit(false)
          return
        }
      }
    }

    showToast('Dati aggiornati!')
setShowEdit(false)
setEditForm(f => ({ ...f, newPassword: '' }))
setAccount(prev => ({ ...prev, type: editForm.type }))
fetchData()
setSavingEdit(false)
  }

  async function aggiungiMembro() {
    if (!nuovoMembroForm.name || !nuovoMembroForm.surname) {
      showToast('Inserisci nome e cognome del membro', 'error'); return
    }
    setSavingMembro(true)

    // Crea membro
    const { data: nuovoMembro, error: memError } = await supabase.from('members').insert({
      account_id: id,
      name: nuovoMembroForm.name,
      surname: nuovoMembroForm.surname,
    }).select().single()

    if (memError) {
      showToast('Errore creazione membro: ' + memError.message, 'error')
      setSavingMembro(false)
      return
    }

    // Abbonamento se selezionato
    if (nuovoMembroForm.subscription_type_id) {
      const tipo = tipiAbb.find(t => t.id === nuovoMembroForm.subscription_type_id)
      await supabase.from('subscriptions').insert({
        member_id: nuovoMembro.id,
        subscription_type_id: nuovoMembroForm.subscription_type_id,
        entries_total: tipo.entries_total,
        entries_used: 0,
        paid_amount: parseFloat(nuovoMembroForm.paid_amount) || tipo.price,
        active: true,
      })
    }

    // Se l'account era singolo, aggiorna a familiare
    if (account.type === 'single') {
      await supabase.from('accounts').update({ type: 'family' }).eq('id', id)
    }

    showToast('Membro aggiunto!')
    setNuovoMembroForm({ name: '', surname: '', subscription_type_id: '', paid_amount: '' })
    setShowNuovoMembro(false)
    fetchData()
    setSavingMembro(false)
  }

  async function saveAbbonamento() {
    if (!form.subscription_type_id) { showToast('Seleziona un tipo di abbonamento', 'error'); return }
    setSaving(true)
    const tipo = tipiAbb.find(t => t.id === form.subscription_type_id)
    const { error } = await supabase.from('subscriptions').insert({
      member_id: selectedMember,
      subscription_type_id: form.subscription_type_id,
      entries_total: tipo.entries_total,
      entries_used: 0,
      paid_amount: parseFloat(form.paid_amount) || tipo.price,
      active: true,
    })
    if (error) { showToast('Errore nel salvataggio', 'error'); setSaving(false); return }
    showToast('Abbonamento salvato')
    setShowForm(false)
    setForm({ subscription_type_id: '', paid_amount: '' })
    fetchData()
    setSaving(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>
  if (!account) return <div style={{ padding: 40, color: '#888' }}>Account non trovato</div>

  const member = members.find(m => m.id === selectedMember)
  const subs = (member?.subscriptions || []).sort((a, b) => b.active - a.active || new Date(b.created_at) - new Date(a.created_at))
  const bookings = (member?.bookings || []).sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* breadcrumb */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14, display: 'flex', gap: 6 }}>
        <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/admin/ospiti')}>Ospiti</span>
        <span>›</span>
        <span>{account.name} {account.surname}</span>
      </div>

      {/* header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div className="avatar avatar-lg">{account.name?.[0]}{account.surname?.[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{account.name} {account.surname}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{account.phone} · @{account.username}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <span className={`pill ${account.type === 'family' ? 'pill-info' : 'pill-gray'}`}>
              {account.type === 'family' ? 'Account familiare' : 'Account singolo'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { setShowEdit(v => !v); setShowNuovoMembro(false) }}>
            {showEdit ? 'Chiudi' : 'Modifica dati'}
          </button>
          <button className="btn-danger" onClick={() => setShowConfirmDelete(true)}>Elimina ospite</button>
        </div>
      </div>

      {/* confirm delete */}
      {showConfirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Elimina ospite</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Stai per eliminare <strong>{account.name} {account.surname}</strong> e tutti i suoi dati (membri, abbonamenti, prenotazioni). Questa operazione non è reversibile.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowConfirmDelete(false)}>Annulla</button>
              <button style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                onClick={deleteAccount}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* form modifica dati */}
      {showEdit && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Modifica dati account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Nome *</label><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label>Cognome *</label><input value={editForm.surname} onChange={e => setEditForm(f => ({ ...f, surname: e.target.value }))} /></div>
            <div className="field"><label>Telefono</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+39 338..." /></div>
            <div className="field"><label>Nome utente *</label><input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Tipo account</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {['single', 'family'].map(t => (
                  <div key={t} onClick={() => setEditForm(f => ({ ...f, type: t }))} style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: `0.5px solid ${editForm.type === t ? '#F5C842' : '#ccc'}`,
                    background: editForm.type === t ? '#FAEEDA' : '#fff',
                    color: editForm.type === t ? '#854F0B' : '#888',
                    cursor: 'pointer', fontSize: 13, fontWeight: editForm.type === t ? 500 : 400,
                  }}>
                    {t === 'single' ? 'Singolo' : 'Familiare'}
                  </div>
                ))}
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Nuova password</label>
              <input type="password" placeholder="Lascia vuoto per non modificarla"
                value={editForm.newPassword} onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))} />
              <div className="hint">Minimo 6 caratteri. Lascia vuoto per mantenere la password attuale.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #eee' }}>
            <button className="btn-ghost" onClick={() => setShowEdit(false)}>Annulla</button>
            <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      )}

      {/* selezione membro + aggiungi membro */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>MEMBRI</div>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowNuovoMembro(v => !v); setShowEdit(false) }}>
            {showNuovoMembro ? 'Chiudi' : '+ Aggiungi membro'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {members.map(m => (
            <button key={m.id} onClick={() => { setSelectedMember(m.id); setShowForm(false) }} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: '0.5px solid #ccc',
              background: m.id === selectedMember ? '#1a1a1a' : '#fff',
              color: m.id === selectedMember ? '#F5C842' : '#888',
            }}>
              {m.name} {m.surname}
            </button>
          ))}
        </div>
      </div>

      {/* form aggiungi nuovo membro */}
      {showNuovoMembro && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #378ADD', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Aggiungi membro all'account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Nome *</label><input value={nuovoMembroForm.name} onChange={e => setNuovoMembroForm(f => ({ ...f, name: e.target.value }))} placeholder="es. Luca" /></div>
            <div className="field"><label>Cognome *</label><input value={nuovoMembroForm.surname} onChange={e => setNuovoMembroForm(f => ({ ...f, surname: e.target.value }))} placeholder="es. Rossi" /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Tipo abbonamento</label>
              <select value={nuovoMembroForm.subscription_type_id} onChange={e => {
                const tipo = tipiAbb.find(t => t.id === e.target.value)
                setNuovoMembroForm(f => ({ ...f, subscription_type_id: e.target.value, paid_amount: tipo?.price || '' }))
              }}>
                <option value="">Seleziona... (opzionale)</option>
                {tipiAbb.map(t => <option key={t.id} value={t.id}>{t.name} — {t.entries_total} ingressi · € {t.price}</option>)}
              </select>
            </div>
            {nuovoMembroForm.subscription_type_id && (
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Importo pagato (€)</label>
                <input type="number" value={nuovoMembroForm.paid_amount} onChange={e => setNuovoMembroForm(f => ({ ...f, paid_amount: e.target.value }))} placeholder="es. 360" />
                <div className="hint">Popola il fatturato</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setShowNuovoMembro(false)}>Annulla</button>
            <button className="btn-primary" onClick={aggiungiMembro} disabled={savingMembro}>
              {savingMembro ? 'Salvataggio...' : 'Aggiungi membro'}
            </button>
          </div>
        </div>
      )}

      {/* abbonamenti */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 500 }}>Abbonamenti — {member?.name} {member?.surname}</h3>
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Chiudi' : '+ Nuovo abbonamento'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Nuovo abbonamento per {member?.name} {member?.surname}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Tipo abbonamento</label>
              <select value={form.subscription_type_id} onChange={e => {
                const tipo = tipiAbb.find(t => t.id === e.target.value)
                setForm(f => ({ ...f, subscription_type_id: e.target.value, paid_amount: tipo?.price || '' }))
              }}>
                <option value="">Seleziona...</option>
                {tipiAbb.map(t => <option key={t.id} value={t.id}>{t.name} — {t.entries_total} ingressi · € {t.price}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Importo pagato (€)</label>
              <input type="number" placeholder="es. 360" value={form.paid_amount}
                onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} />
              <div className="hint">Può essere inferiore al prezzo pieno</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Annulla</button>
            <button className="btn-primary" onClick={saveAbbonamento} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva abbonamento'}
            </button>
          </div>
        </div>
      )}

      {/* lista abbonamenti */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {subs.length === 0 && <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessun abbonamento</div>}
        {subs.map(sub => {
          const rem = sub.entries_total - sub.entries_used
          const pct = Math.round((sub.entries_used / sub.entries_total) * 100)
          const label = !sub.active ? 'Disattivo' : rem === 0 ? 'Esaurito' : 'Attivo'
          const pillClass = label === 'Attivo' ? 'pill-ok' : label === 'Esaurito' ? 'pill-alert' : 'pill-gray'
          const borderColor = label === 'Attivo' ? '#F5C842' : label === 'Esaurito' ? '#E24B4A' : '#ccc'

          return (
            <div key={sub.id} className="card" style={{
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: '0 12px 12px 0',
              opacity: label === 'Disattivo' ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{sub.subscription_types?.name}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 500 }}>€ {(sub.subscription_types?.price || 0).toLocaleString('it-IT')}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>pagato € {(sub.paid_amount || 0).toLocaleString('it-IT')}</div>
                  <span className={`pill ${pillClass}`} style={{ marginTop: 4 }}>{label}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginTop: 10 }}>
                <span>{sub.entries_used} usati su {sub.entries_total}</span>
                <span style={{ fontWeight: 500, color: rem <= 3 ? '#E24B4A' : '#1a1a1a' }}>{rem} rimasti</span>
              </div>
              <div className="progress" style={{ marginTop: 5 }}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: rem <= 3 ? '#E24B4A' : '#F5C842' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* storico ingressi */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 500 }}>Storico ingressi</h3>
        <span style={{ fontSize: 12, color: '#888' }}>{bookings.length} totali</span>
      </div>
      <div className="table-wrap">
        {bookings.length === 0
          ? <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Nessun ingresso registrato</div>
          : (
            <table>
              <thead><tr><th>Data</th><th>Stato</th></tr></thead>
              <tbody>
                {bookings.map((b, i) => (
                  <tr key={i}>
                    <td>{new Date(b.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    <td>
                      <span className={`pill ${b.status === 'confirmed' ? 'pill-ok' : b.status === 'cancelled' ? 'pill-alert' : 'pill-warn'}`}>
                        {b.status === 'confirmed' ? 'Effettuato' : b.status === 'cancelled' ? 'Cancellato' : 'Prenotato'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
