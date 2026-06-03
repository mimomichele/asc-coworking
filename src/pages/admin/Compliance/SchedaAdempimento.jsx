import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { statoMeta, fmtData, fmtEuro, fmtFrequenza, apriAllegato } from '../../../lib/compliance'

// Stato calcolato lato client dall'ultima scadenza (stesse soglie della vista).
function computeStato(scadenza) {
  if (!scadenza) return 'mai_registrato'
  const giorni = Math.round((new Date(scadenza + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000)
  if (giorni < 0) return 'scaduto'
  if (giorni <= 30) return 'in_scadenza'
  if (giorni <= 60) return 'imminente'
  return 'in_regola'
}

const emptyRinnovo = () => ({ data_rinnovo: new Date().toISOString().slice(0, 10), costo: '', fornitore_id: '', note: '', files: [] })

export default function SchedaAdempimento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [adempimento, setAdempimento] = useState(null)
  const [rinnovi, setRinnovi] = useState([])
  const [allegati, setAllegati] = useState([])
  const [categorie, setCategorie] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [savingA, setSavingA] = useState(false)

  const [rinForm, setRinForm] = useState(emptyRinnovo())
  const [savingR, setSavingR] = useState(false)
  const [confirm, setConfirm] = useState(null) // { titolo, testo, onConferma }

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [a, r, al, cat, forn] = await Promise.all([
      supabase.from('compliance_adempimenti').select('*, compliance_categories(nome,colore), compliance_fornitori(nome)').eq('id', id).single(),
      supabase.from('compliance_rinnovi').select('*, compliance_fornitori(nome)').eq('adempimento_id', id).order('data_rinnovo', { ascending: false }),
      supabase.from('compliance_allegati').select('*').eq('adempimento_id', id).order('created_at', { ascending: false }),
      supabase.from('compliance_categories').select('id, nome').order('ordine').order('nome'),
      supabase.from('compliance_fornitori').select('id, nome').eq('attivo', true).order('nome'),
    ])
    if (a.error) { showToast('Errore: ' + a.error.message, 'error'); setLoading(false); return }
    setAdempimento(a.data)
    setRinnovi(r.data || [])
    setAllegati(al.data || [])
    setCategorie(cat.data || [])
    setFornitori(forn.data || [])
    setRinForm({ ...emptyRinnovo(), fornitore_id: a.data.fornitore_default_id || '' })
    setLoading(false)
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const allegatiGenerali = useMemo(() => allegati.filter(a => !a.rinnovo_id), [allegati])
  const allegatiByRinnovo = useMemo(() => {
    const m = {}
    for (const a of allegati) if (a.rinnovo_id) (m[a.rinnovo_id] ||= []).push(a)
    return m
  }, [allegati])

  // --- upload multiplo: N file -> N righe compliance_allegati ---
  async function uploadAllegati(files, prefix, rinnovoId) {
    const list = Array.from(files || [])
    if (list.length === 0) return { ok: 0 }
    const { data: { user } } = await supabase.auth.getUser()
    const results = await Promise.all(list.map(async file => {
      const uuid = crypto.randomUUID()
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const path = `${prefix}/${uuid}.${ext}`
      const { error } = await supabase.storage.from('compliance-docs').upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (error) return { error: error.message, name: file.name }
      return { row: { adempimento_id: id, rinnovo_id: rinnovoId, path, nome: file.name, mime: file.type || null, dimensione: file.size, created_by: user?.id ?? null } }
    }))
    const rows = results.filter(r => r.row).map(r => r.row)
    const failed = results.filter(r => r.error)
    if (rows.length > 0) {
      const { error } = await supabase.from('compliance_allegati').insert(rows)
      if (error) {
        await supabase.storage.from('compliance-docs').remove(rows.map(r => r.path)) // rollback
        return { error: error.message }
      }
    }
    return { ok: rows.length, failed }
  }

  async function caricaGenerali(files) {
    const res = await uploadAllegati(files, `compliance/${id}/generali`, null)
    if (res.error) { showToast('Errore: ' + res.error, 'error'); return }
    showToast(`${res.ok} file caricat${res.ok === 1 ? 'o' : 'i'}` + (res.failed?.length ? ` · ${res.failed.length} falliti` : ''), res.failed?.length ? 'error' : 'success')
    fetchAll()
  }

  async function caricaPerRinnovo(rinnovoId, files) {
    const res = await uploadAllegati(files, `compliance/${id}/rinnovi/${rinnovoId}`, rinnovoId)
    if (res.error) { showToast('Errore: ' + res.error, 'error'); return }
    showToast(`${res.ok} file caricat${res.ok === 1 ? 'o' : 'i'}` + (res.failed?.length ? ` · ${res.failed.length} falliti` : ''), res.failed?.length ? 'error' : 'success')
    fetchAll()
  }

  function openAllegato(a) { apriAllegato(a.path).then(r => r?.error && showToast(r.error, 'error')) }

  function chiediEliminaAllegato(a) {
    setConfirm({
      titolo: 'Elimina allegato',
      testo: `Eliminare "${a.nome}"? Il file verrà rimosso definitivamente.`,
      onConferma: async () => {
        const { error } = await supabase.from('compliance_allegati').delete().eq('id', a.id)
        if (error) { showToast('Errore: ' + error.message, 'error'); setConfirm(null); return }
        await supabase.storage.from('compliance-docs').remove([a.path])
        showToast('Allegato eliminato'); setConfirm(null); fetchAll()
      },
    })
  }

  function openEdit() {
    setForm({
      titolo: adempimento.titolo,
      categoria_id: adempimento.categoria_id || '',
      frequenza_mesi: adempimento.frequenza_mesi ?? '',
      riferimento_normativo: adempimento.riferimento_normativo || '',
      fornitore_default_id: adempimento.fornitore_default_id || '',
      responsabile_interno: adempimento.responsabile_interno || '',
      note: adempimento.note || '',
    })
    setEditing(true)
  }

  async function salvaAdempimento() {
    if (!form.titolo.trim()) { showToast('Titolo obbligatorio', 'error'); return }
    setSavingA(true)
    const payload = {
      titolo: form.titolo.trim(),
      categoria_id: form.categoria_id || null,
      frequenza_mesi: form.frequenza_mesi === '' ? null : parseInt(form.frequenza_mesi, 10),
      riferimento_normativo: form.riferimento_normativo.trim() || null,
      fornitore_default_id: form.fornitore_default_id || null,
      responsabile_interno: form.responsabile_interno.trim() || null,
      note: form.note.trim() || null,
    }
    const { error } = await supabase.from('compliance_adempimenti').update(payload).eq('id', id)
    if (error) { showToast('Errore: ' + error.message, 'error'); setSavingA(false); return }
    showToast('Adempimento aggiornato'); setEditing(false); setSavingA(false); fetchAll()
  }

  function chiediEliminaAdempimento() {
    setConfirm({
      titolo: 'Elimina adempimento',
      testo: `Eliminare "${adempimento.titolo}"? Verrà rimosso dallo scadenziario (i rinnovi restano in archivio).`,
      onConferma: async () => {
        const { error } = await supabase.from('compliance_adempimenti').update({ deleted_at: new Date().toISOString(), attivo: false }).eq('id', id)
        if (error) { showToast('Errore: ' + error.message, 'error'); setConfirm(null); return }
        navigate('/admin/compliance')
      },
    })
  }

  async function registraRinnovo() {
    if (!rinForm.data_rinnovo) { showToast('Inserisci la data', 'error'); return }
    setSavingR(true)
    const { data: { user } } = await supabase.auth.getUser()
    const rinnovoId = crypto.randomUUID()
    const { error } = await supabase.from('compliance_rinnovi').insert({
      id: rinnovoId,
      adempimento_id: id,
      data_rinnovo: rinForm.data_rinnovo,
      costo: rinForm.costo === '' ? null : Number(rinForm.costo),
      fornitore_id: rinForm.fornitore_id || null,
      note: rinForm.note.trim() || null,
      created_by: user?.id ?? null,
    })
    if (error) { showToast('Errore: ' + error.message, 'error'); setSavingR(false); return }
    let msg = 'Rinnovo registrato'
    if (rinForm.files.length > 0) {
      const res = await uploadAllegati(rinForm.files, `compliance/${id}/rinnovi/${rinnovoId}`, rinnovoId)
      if (res.error) msg = 'Rinnovo creato, ma errore allegati: ' + res.error
      else if (res.failed?.length) msg = `Rinnovo registrato · ${res.ok} file, ${res.failed.length} falliti`
      else msg = `Rinnovo registrato con ${res.ok} allegat${res.ok === 1 ? 'o' : 'i'}`
    }
    showToast(msg)
    setRinForm({ ...emptyRinnovo(), fornitore_id: adempimento.fornitore_default_id || '' })
    setSavingR(false); fetchAll()
  }

  function chiediEliminaRinnovo(r) {
    setConfirm({
      titolo: 'Elimina rinnovo',
      testo: `Eliminare il rinnovo del ${fmtData(r.data_rinnovo)}? Verranno rimossi anche i suoi allegati.`,
      onConferma: async () => {
        const files = (allegatiByRinnovo[r.id] || []).map(a => a.path)
        if (files.length > 0) await supabase.storage.from('compliance-docs').remove(files)
        const { error } = await supabase.from('compliance_rinnovi').delete().eq('id', r.id)
        if (error) { showToast('Errore: ' + error.message, 'error'); setConfirm(null); return }
        showToast('Rinnovo eliminato'); setConfirm(null); fetchAll()
      },
    })
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>
  if (!adempimento) return <div style={{ padding: 40, color: '#888' }}>Adempimento non trovato.</div>

  const ultima = rinnovi[0]
  const m = statoMeta(computeStato(ultima?.data_scadenza_calcolata))

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/compliance" style={{ color: '#888', textDecoration: 'none' }}>← Scadenziario</Link>
      </div>

      {/* HEADER + STATO */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500 }}>{adempimento.titolo}</h2>
            <span className={`pill ${m.cls}`}>{m.label}</span>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: adempimento.compliance_categories?.colore || '#ccc' }} />
              {adempimento.compliance_categories?.nome || '—'}
            </span>
            {' · '}{fmtFrequenza(adempimento.frequenza_mesi)}
            {adempimento.riferimento_normativo ? ` · ${adempimento.riferimento_normativo}` : ''}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Prossima scadenza: <strong>{fmtData(ultima?.data_scadenza_calcolata)}</strong>
            {adempimento.fornitore_default_id && adempimento.compliance_fornitori ? ` · Fornitore: ${adempimento.compliance_fornitori.nome}` : ''}
          </div>
          {adempimento.responsabile_interno && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Responsabile: {adempimento.responsabile_interno}</div>}
          {adempimento.note && <div style={{ fontSize: 12, color: '#888', marginTop: 6, maxWidth: 600 }}>{adempimento.note}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!editing && <button className="btn-ghost" onClick={openEdit}>Modifica</button>}
          <button className="btn-danger" onClick={chiediEliminaAdempimento}>Elimina</button>
        </div>
      </div>

      {/* FORM MODIFICA ADEMPIMENTO */}
      {editing && form && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Modifica adempimento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Titolo *</label><input value={form.titolo} onChange={e => setForm(f => ({ ...f, titolo: e.target.value }))} /></div>
            <div className="field">
              <label>Categoria</label>
              <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                <option value="">—</option>
                {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="field"><label>Frequenza (mesi)</label><input type="number" value={form.frequenza_mesi} onChange={e => setForm(f => ({ ...f, frequenza_mesi: e.target.value }))} placeholder="vuoto = ad evento" /></div>
            <div className="field"><label>Riferimento normativo</label><input value={form.riferimento_normativo} onChange={e => setForm(f => ({ ...f, riferimento_normativo: e.target.value }))} /></div>
            <div className="field">
              <label>Fornitore predefinito</label>
              <select value={form.fornitore_default_id} onChange={e => setForm(f => ({ ...f, fornitore_default_id: e.target.value }))}>
                <option value="">—</option>
                {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="field"><label>Responsabile interno</label><input value={form.responsabile_interno} onChange={e => setForm(f => ({ ...f, responsabile_interno: e.target.value }))} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Annulla</button>
            <button className="btn-primary" onClick={salvaAdempimento} disabled={savingA}>{savingA ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      {/* DOCUMENTI GENERALI */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Documenti generali</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Documenti dell'adempimento non legati a un rinnovo (manuale, planimetria, ecc.).</div>
        <AllegatiList allegati={allegatiGenerali} onOpen={openAllegato} onDelete={chiediEliminaAllegato} />
        <div style={{ marginTop: 10 }}>
          <UploadMulti onUpload={caricaGenerali} />
        </div>
      </div>

      {/* REGISTRA RINNOVO */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Registra rinnovo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field"><label>Data rinnovo *</label><input type="date" value={rinForm.data_rinnovo} onChange={e => setRinForm(f => ({ ...f, data_rinnovo: e.target.value }))} /></div>
          <div className="field"><label>Costo (€)</label><input type="number" step="0.01" value={rinForm.costo} onChange={e => setRinForm(f => ({ ...f, costo: e.target.value }))} /></div>
          <div className="field">
            <label>Fornitore</label>
            <select value={rinForm.fornitore_id} onChange={e => setRinForm(f => ({ ...f, fornitore_id: e.target.value }))}>
              <option value="">—</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Note</label><input value={rinForm.note} onChange={e => setRinForm(f => ({ ...f, note: e.target.value }))} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Allegati (più file, PDF o immagini)</label>
            <input type="file" accept=".pdf,image/*" multiple onChange={e => setRinForm(f => ({ ...f, files: Array.from(e.target.files || []) }))} />
            {rinForm.files.length > 0 && <div className="hint">{rinForm.files.length} file selezionat{rinForm.files.length === 1 ? 'o' : 'i'}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-primary" onClick={registraRinnovo} disabled={savingR}>{savingR ? 'Salvataggio...' : 'Registra rinnovo'}</button>
        </div>
      </div>

      {/* STORICO RINNOVI */}
      <h3 style={{ fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 10 }}>Storico rinnovi ({rinnovi.length})</h3>
      {rinnovi.length === 0 && <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessun rinnovo registrato.</div>}
      {rinnovi.map(r => (
        <div key={r.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtData(r.data_rinnovo)}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Scadenza calcolata: {fmtData(r.data_scadenza_calcolata)} · {fmtEuro(r.costo)}
                {r.compliance_fornitori?.nome ? ` · ${r.compliance_fornitori.nome}` : ''}
              </div>
              {r.note && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.note}</div>}
            </div>
            <button className="btn-danger" onClick={() => chiediEliminaRinnovo(r)}>Elimina rinnovo</button>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #eee' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Allegati</div>
            <AllegatiList allegati={allegatiByRinnovo[r.id]} onOpen={openAllegato} onDelete={chiediEliminaAllegato} />
            <div style={{ marginTop: 8 }}>
              <UploadMulti label="Aggiungi file" onUpload={files => caricaPerRinnovo(r.id, files)} />
            </div>
          </div>
        </div>
      ))}

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{confirm.titolo}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{confirm.testo}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>Annulla</button>
              <button style={{ background: '#E24B4A', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={confirm.onConferma}>Sì, elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Lista allegati (download + elimina). Riusata per generali e per ogni rinnovo.
function AllegatiList({ allegati, onOpen, onDelete }) {
  if (!allegati || allegati.length === 0) return <div style={{ fontSize: 12, color: '#bbb' }}>Nessun allegato</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {allegati.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" style={{ textAlign: 'left', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => onOpen(a)}>📎 {a.nome}</button>
          <button className="btn-danger" onClick={() => onDelete(a)}>Elimina</button>
        </div>
      ))}
    </div>
  )
}

// Selezione multipla + bottone Carica. Resetta dopo l'upload.
function UploadMulti({ onUpload, label }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(0)
  async function go() {
    if (files.length === 0) return
    setBusy(true)
    await onUpload(files)
    setBusy(false); setFiles([]); setKey(k => k + 1)
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input key={key} type="file" multiple accept=".pdf,image/*" onChange={e => setFiles(Array.from(e.target.files || []))} style={{ fontSize: 12 }} />
      <button className="btn-ghost" onClick={go} disabled={busy || files.length === 0}>
        {busy ? 'Carico...' : `${label || 'Carica'}${files.length ? ' (' + files.length + ')' : ''}`}
      </button>
    </div>
  )
}
