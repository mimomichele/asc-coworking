import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { statoMeta, fmtData, fmtFrequenza } from '../../../lib/compliance'

const emptyForm = {
  titolo: '', categoria_id: '', frequenza_mesi: '', riferimento_normativo: '',
  fornitore_default_id: '', responsabile_interno: '', note: '',
}

export default function Compliance() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [categorie, setCategorie] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [filtroCat, setFiltroCat] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [sc, cat, forn] = await Promise.all([
      supabase.from('v_compliance_scadenziario').select('*'),
      supabase.from('compliance_categories').select('id, nome, colore').order('ordine').order('nome'),
      supabase.from('compliance_fornitori').select('id, nome').eq('attivo', true).order('nome'),
    ])
    if (sc.error) showToast('Errore: ' + sc.error.message, 'error')
    setRows(sc.data || [])
    setCategorie(cat.data || [])
    setFornitori(forn.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function salvaAdempimento() {
    if (!form.titolo.trim()) { showToast('Inserisci il titolo', 'error'); return }
    if (!form.categoria_id) { showToast('Scegli una categoria', 'error'); return }
    setSaving(true)
    const payload = {
      titolo: form.titolo.trim(),
      categoria_id: form.categoria_id,
      frequenza_mesi: form.frequenza_mesi === '' ? null : parseInt(form.frequenza_mesi, 10),
      riferimento_normativo: form.riferimento_normativo.trim() || null,
      fornitore_default_id: form.fornitore_default_id || null,
      responsabile_interno: form.responsabile_interno.trim() || null,
      note: form.note.trim() || null,
    }
    const { error } = await supabase.from('compliance_adempimenti').insert(payload)
    if (error) { showToast('Errore: ' + error.message, 'error'); setSaving(false); return }
    showToast('Adempimento creato')
    setForm(emptyForm); setShowForm(false); setSaving(false)
    fetchAll()
  }

  const visibili = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter(r => filtroCat === 'all' || r.categoria_id === filtroCat)
      .filter(r => !q || (r.titolo || '').toLowerCase().includes(q) || (r.riferimento_normativo || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const oa = statoMeta(a.stato).ord, ob = statoMeta(b.stato).ord
        if (oa !== ob) return oa - ob
        const ga = a.giorni_alla_scadenza, gb = b.giorni_alla_scadenza
        if (ga == null) return 1
        if (gb == null) return -1
        return ga - gb
      })
  }, [rows, filtroCat, search])

  // conteggi per stato (riepilogo)
  const conteggi = useMemo(() => {
    const c = { scaduto: 0, in_scadenza: 0, imminente: 0, in_regola: 0, mai_registrato: 0 }
    for (const r of rows) if (c[r.stato] != null) c[r.stato]++
    return c
  }, [rows])

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Scadenziario</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{rows.length} adempimenti</div>
        </div>
        {!showForm && <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nuovo adempimento</button>}
      </div>

      {/* RIEPILOGO STATI */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {['scaduto', 'in_scadenza', 'imminente', 'in_regola', 'mai_registrato'].map(s => (
          <span key={s} className={`pill ${statoMeta(s).cls}`}>{statoMeta(s).label}: {conteggi[s]}</span>
        ))}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #F5C842', borderRadius: '0 12px 12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Nuovo adempimento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Titolo *</label><input value={form.titolo} onChange={e => setForm(f => ({ ...f, titolo: e.target.value }))} /></div>
            <div className="field">
              <label>Categoria *</label>
              <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                <option value="">— scegli —</option>
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
            <button className="btn-ghost" onClick={() => { setShowForm(false); setForm(emptyForm) }}>Annulla</button>
            <button className="btn-primary" onClick={salvaAdempimento} disabled={saving}>{saving ? 'Salvataggio...' : 'Crea adempimento'}</button>
          </div>
        </div>
      )}

      {/* FILTRI */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={selStyle}>
          <option value="all">Tutte le categorie</option>
          {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca titolo o normativa…" style={{ ...selStyle, flex: 1, minWidth: 160 }} />
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Adempimento</th>
              <th style={{ width: 150 }}>Categoria</th>
              <th style={{ width: 110 }}>Frequenza</th>
              <th style={{ width: 120 }}>Prossima scad.</th>
              <th style={{ width: 130 }}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {visibili.map(r => {
              const m = statoMeta(r.stato)
              return (
                <tr key={r.id} onClick={() => navigate(`/admin/compliance/a/${r.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.titolo}</div>
                    {r.riferimento_normativo && <div style={{ fontSize: 11, color: '#aaa' }}>{r.riferimento_normativo}</div>}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: r.categoria_colore || '#ccc' }} />
                      {r.categoria || '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#666' }}>{fmtFrequenza(r.frequenza_mesi)}</td>
                  <td style={{ fontSize: 12 }}>
                    {fmtData(r.prossima_scadenza)}
                    {r.giorni_alla_scadenza != null && (
                      <div style={{ fontSize: 11, color: '#aaa' }}>
                        {r.giorni_alla_scadenza < 0 ? `${-r.giorni_alla_scadenza}gg fa` : `tra ${r.giorni_alla_scadenza}gg`}
                      </div>
                    )}
                  </td>
                  <td><span className={`pill ${m.cls}`}>{m.label}</span></td>
                </tr>
              )
            })}
            {visibili.length === 0 && <tr><td colSpan={5} style={{ color: '#888', textAlign: 'center', padding: 24 }}>Nessun adempimento per i filtri scelti.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const selStyle = { padding: '8px 10px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff' }
