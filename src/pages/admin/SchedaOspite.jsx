import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import AlloggiatiFields, {
  emptyAlloggiati, alloggiatiFromMember, alloggiatiToPayload, validateAlloggiati,
} from '../../components/AlloggiatiFields.jsx'

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
  const [showAlloggiati, setShowAlloggiati] = useState(false)
  const [form, setForm] = useState({ subscription_type_id: '', paid_amount: '' })
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', username: '', type: '', newPassword: '' })
  const [nuovoMembroForm, setNuovoMembroForm] = useState({ name: '', surname: '', subscription_type_id: '', paid_amount: '' })
  const [nuovoMembroAlloggiati, setNuovoMembroAlloggiati] = useState(emptyAlloggiati())
  const [alloggiatiForm, setAlloggiatiForm] = useState(emptyAlloggiati())
  const [saving, setSaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingMembro, setSavingMembro] = useState(false)
  const [savingAlloggiati, setSavingAlloggiati] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creatingHead, setCreatingHead] = useState(false)

  useEffect(() => { fetchData(); fetchTipi() }, [id])

  // Sync di alloggiatiForm SOLO al cambio del membro selezionato.
  // NON ricarichiamo su [members] perche' un refetch globale (es. dopo
  // saveAbbonamento o aggiungiMembro) sovrascriverebbe le modifiche in corso
  // o ripristinerebbe valori stale se PostgREST e' lento a propagare.
  // L'apertura dell'editor fa il proprio fetch fresco del singolo membro
  // (vedi openAlloggiatiEditor), e il save applica in-place la riga restituita.
  useEffect(() => {
    if (!selectedMember) { setAlloggiatiForm(emptyAlloggiati()); setShowAlloggiati(false); return }
    const m = members.find(x => x.id === selectedMember)
    if (!m) return
    setAlloggiatiForm(alloggiatiFromMember(m))
    setShowAlloggiati(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMember])

  async function fetchData() {
    const { data: acc } = await supabase.from('accounts').select('*').eq('id', id).single()
    if (!acc) { setLoading(false); return }

    const memSelect = `*, subscriptions(*, subscription_types(name, entries_total, price)), bookings(date, status, created_at)`
    const { data: mems } = await supabase
      .from('members').select(memSelect).eq('account_id', id).order('created_at')

    // Nota: NON creiamo qui il membro intestatario per account "orfani".
    // L'invariante "ogni account ha almeno l'intestatario come membro" e'
    // responsabilita' di NuovoOspite (alla creazione dell'account). Un
    // auto-fix lazy qui in dev con React.StrictMode causava duplicazioni
    // (useEffect invocato 2x -> 2 SELECT con 0 righe entrambe -> 2 INSERT).
    // Il caso orfano (account inserito a mano nel DB senza membri) e' gestito
    // sotto da una UI di emergenza con bottone manuale idempotente.

    setAccount(acc)
    setEditForm({
      name: acc.name || '',
      surname: acc.surname || '',
      phone: acc.phone || '',
      username: acc.username || '',
      type: acc.type || 'single',
      newPassword: '',
    })
    setMembers(mems || [])
    // Mantieni il membro selezionato solo se esiste ancora nel nuovo account,
    // altrimenti torna al primo. Senza questo, navigando tra account il
    // selectedMember resta "stale" e la sezione Alloggiati non rende.
    if (mems?.length) {
      const stillValid = selectedMember && mems.some(m => m.id === selectedMember)
      if (!stillValid) setSelectedMember(mems[0].id)
    } else {
      setSelectedMember(null)
    }
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
    const errA = validateAlloggiati(nuovoMembroAlloggiati)
    if (errA) { showToast(errA, 'error'); return }
    setSavingMembro(true)

    // Crea membro con dati Alloggiati
    const { data: nuovoMembro, error: memError } = await supabase.from('members').insert({
      account_id: id,
      name: nuovoMembroForm.name,
      surname: nuovoMembroForm.surname,
      ...alloggiatiToPayload(nuovoMembroAlloggiati),
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
    setNuovoMembroAlloggiati(emptyAlloggiati())
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

  // Recovery esplicito per account legacy/orfani senza membri.
  // Doppia barriera anti-duplicazione:
  //  1) flag creatingHead disabilita il bottone (no doppio click / doppia esecuzione)
  //  2) SELECT esplicito appena prima dell'INSERT (no race con altre sessioni
  //     o con un altro tab che ha gia' creato il membro)
  async function creaMembroIntestatario() {
    if (creatingHead || !account) return
    setCreatingHead(true)
    try {
      // Verifica idempotente: se nel frattempo qualcuno l'ha gia' creato, esci.
      const { data: existing, error: selErr } = await supabase
        .from('members').select('id').eq('account_id', account.id).limit(1)
      if (selErr) {
        showToast('Errore verifica: ' + selErr.message, 'error'); return
      }
      if (existing && existing.length > 0) {
        showToast('Esiste gia\' un membro per questo account.', 'error')
        await fetchData()
        return
      }
      const { error: insErr } = await supabase.from('members').insert({
        account_id: account.id,
        name: account.name,
        surname: account.surname,
      })
      if (insErr) {
        showToast('Errore creazione: ' + insErr.message, 'error'); return
      }
      showToast('Membro intestatario creato')
      await fetchData()
    } finally {
      setCreatingHead(false)
    }
  }

  // Apertura editor: rilegge il singolo membro dal DB per garantire dati
  // freschi (utile quando la scheda e' rimasta aperta in background o e'
  // appena stata navigata da un'altra sessione/persona).
  async function openAlloggiatiEditor() {
    if (!selectedMember) return
    const { data: m, error } = await supabase
      .from('members').select('*').eq('id', selectedMember).maybeSingle()
    if (error) {
      console.error('openAlloggiatiEditor refetch failed:', error)
      showToast('Errore caricamento: ' + error.message, 'error')
      return
    }
    if (m) {
      setAlloggiatiForm(alloggiatiFromMember(m))
      // riallinea la riga nello state locale (preserva subscriptions/bookings)
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
    }
    setShowAlloggiati(true)
    setShowEdit(false)
    setShowNuovoMembro(false)
    setShowForm(false)
  }

  // Salvataggio: UPDATE ... RETURNING * in un solo round-trip e apply in-place.
  // Niente fetchData() globale: evita race condition tra UPDATE e il SELECT
  // successivo (che poteva restituire una vista stale e "annullare" lo save).
  // La reception puo' lasciare campi parziali — nessuna validazione bloccante.
  async function saveAlloggiati() {
    if (!selectedMember) return
    setSavingAlloggiati(true)
    const payload = alloggiatiToPayload(alloggiatiForm)
    const { data: updated, error } = await supabase
      .from('members')
      .update(payload)
      .eq('id', selectedMember)
      .select('*')
      .maybeSingle()
    if (error) {
      console.error('saveAlloggiati failed:', error, 'payload:', payload)
      showToast('Errore: ' + error.message, 'error')
      setSavingAlloggiati(false)
      return
    }
    if (updated) {
      // riallinea il form con cio' che e' effettivamente nel DB (canonico)
      setAlloggiatiForm(alloggiatiFromMember(updated))
      setMembers(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    }
    showToast('Dati Alloggiati salvati')
    setShowAlloggiati(false)
    setSavingAlloggiati(false)
  }

  // Stato di completezza Alloggiati per la pillola accanto al nome del membro.
  function alloggiatiStatus(m) {
    if (!m) return { label: 'Da compilare', cls: 'pill-gray' }
    const base = m.sesso && m.data_nascita && m.stato_nascita_cod && m.cittadinanza_cod
    if (!base) return { label: 'Da compilare', cls: 'pill-gray' }
    if (m.documento_acquisito && m.tipo_documento_cod && m.numero_documento) {
      return { label: 'Dati + documento OK', cls: 'pill-ok' }
    }
    return { label: 'Documento mancante', cls: 'pill-warn' }
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
          <button className="btn-ghost" onClick={() => { setShowEdit(v => !v); setShowNuovoMembro(false); setShowAlloggiati(false) }}>
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

      {/* Recovery: account orfano senza membri. Caso raro (account creato a
          mano nel DB senza membri). NuovoOspite garantisce l'invariante per
          gli account creati dall'app. */}
      {members.length === 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #E24B4A', borderRadius: '0 12px 12px 0', background: '#FCEBEB' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A32D2D', marginBottom: 6 }}>
            Account senza membri
          </div>
          <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 12 }}>
            Questo account non ha alcun membro collegato. Crea il membro intestatario
            (con nome <strong>{account.name} {account.surname}</strong>) per poter
            registrare dati Alloggiati, abbonamenti e prenotazioni. Eventuali familiari
            si aggiungono dopo dal pulsante "+ Aggiungi membro".
          </div>
          <button
            className="btn-primary"
            style={{ fontSize: 13, padding: '8px 16px' }}
            disabled={creatingHead}
            onClick={creaMembroIntestatario}
          >
            {creatingHead ? 'Creazione…' : 'Crea membro intestatario'}
          </button>
        </div>
      )}

      {/* selezione membro + aggiungi membro */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>MEMBRI</div>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowNuovoMembro(v => !v); setShowEdit(false); setShowAlloggiati(false) }}>
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

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #eee' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>
              Dati Alloggiati Web — {nuovoMembroForm.name || 'nuovo membro'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
              Obbligatori. Per i nati all'estero comune e provincia restano vuoti.
            </div>
            <AlloggiatiFields value={nuovoMembroAlloggiati} onChange={setNuovoMembroAlloggiati} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #eee' }}>
            <button className="btn-ghost" onClick={() => setShowNuovoMembro(false)}>Annulla</button>
            <button className="btn-primary" onClick={aggiungiMembro} disabled={savingMembro}>
              {savingMembro ? 'Salvataggio...' : 'Aggiungi membro'}
            </button>
          </div>
        </div>
      )}

      {/* dati alloggiati web */}
      {member && (() => {
        const stato = alloggiatiStatus(member)
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                Dati Alloggiati Web — {member.name} {member.surname}
                <span className={`pill ${stato.cls}`}>{stato.label}</span>
              </h3>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => showAlloggiati ? setShowAlloggiati(false) : openAlloggiatiEditor()}
              >
                {showAlloggiati ? 'Chiudi' : 'Compila / modifica'}
              </button>
            </div>

            {showAlloggiati && (
              <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  Campi del tracciato ALLOGGIATI WEB. Qui in modifica i campi possono essere lasciati
                  parziali (la reception li completa nel tempo). Alla creazione di un nuovo ospite o
                  membro invece sono tutti obbligatori.
                </div>
                <AlloggiatiFields value={alloggiatiForm} onChange={setAlloggiatiForm} requiredMarker={false} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #eee' }}>
                  <button className="btn-ghost" onClick={() => setShowAlloggiati(false)}>Annulla</button>
                  <button className="btn-primary" onClick={saveAlloggiati} disabled={savingAlloggiati}>
                    {savingAlloggiati ? 'Salvataggio...' : 'Salva dati Alloggiati'}
                  </button>
                </div>
              </div>
            )}
          </>
        )
      })()}

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
