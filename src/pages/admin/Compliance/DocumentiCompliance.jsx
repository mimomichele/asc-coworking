import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { apriAllegato, fmtData } from '../../../lib/compliance'

const isImage = (mime) => !!mime && mime.startsWith('image/')
function iconaFile(a) {
  const ext = (a.nome.split('.').pop() || '').toLowerCase()
  if (a.mime === 'application/pdf' || ext === 'pdf') return '📄'
  if (isImage(a.mime) || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️'
  return '📎'
}
function slug(s) {
  return (s || 'adempimento').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'adempimento'
}

export default function DocumentiCompliance() {
  const [adempimenti, setAdempimenti] = useState([])
  const [categorie, setCategorie] = useState([])
  const [filtroCat, setFiltroCat] = useState('all')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState(null)
  const [allegati, setAllegati] = useState([])
  const [rinnovi, setRinnovi] = useState([])
  const [thumbs, setThumbs] = useState({})
  const [loadingList, setLoadingList] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [zipStatus, setZipStatus] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchLista() }, [])

  async function fetchLista() {
    const [ad, cat] = await Promise.all([
      supabase.from('compliance_adempimenti').select('id, titolo, categoria_id, compliance_categories(nome,colore)').eq('attivo', true).is('deleted_at', null).order('titolo'),
      supabase.from('compliance_categories').select('id, nome').order('ordine').order('nome'),
    ])
    if (ad.error) showToast('Errore: ' + ad.error.message, 'error')
    setAdempimenti(ad.data || [])
    setCategorie(cat.data || [])
    setLoadingList(false)
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  async function seleziona(a) {
    setSel(a); setLoadingFiles(true); setAllegati([]); setRinnovi([]); setThumbs({})
    const [al, rin] = await Promise.all([
      supabase.from('compliance_allegati').select('*').eq('adempimento_id', a.id).order('created_at', { ascending: false }),
      supabase.from('compliance_rinnovi').select('id, data_rinnovo').eq('adempimento_id', a.id),
    ])
    if (al.error) { showToast('Errore: ' + al.error.message, 'error'); setLoadingFiles(false); return }
    const files = al.data || []
    setAllegati(files)
    setRinnovi(rin.data || [])
    // miniature per le immagini (signed url in batch)
    const imgPaths = files.filter(f => isImage(f.mime)).map(f => f.path)
    if (imgPaths.length > 0) {
      const { data: signed } = await supabase.storage.from('compliance-docs').createSignedUrls(imgPaths, 600)
      const map = {}
      for (const s of signed || []) if (s.signedUrl && !s.error) map[s.path] = s.signedUrl
      setThumbs(map)
    }
    setLoadingFiles(false)
  }

  const adempimentiFiltrati = useMemo(() => {
    const q = search.trim().toLowerCase()
    return adempimenti
      .filter(a => filtroCat === 'all' || a.categoria_id === filtroCat)
      .filter(a => !q || (a.titolo || '').toLowerCase().includes(q))
  }, [adempimenti, filtroCat, search])

  const rinnovoDate = useMemo(() => {
    const m = {}; for (const r of rinnovi) m[r.id] = r.data_rinnovo; return m
  }, [rinnovi])

  // gruppi: generali + un gruppo per rinnovo (solo con file), rinnovi per data desc
  const gruppi = useMemo(() => {
    const generali = allegati.filter(a => !a.rinnovo_id)
    const byRin = {}
    for (const a of allegati) if (a.rinnovo_id) (byRin[a.rinnovo_id] ||= []).push(a)
    const rinGroups = Object.keys(byRin)
      .map(rid => ({ key: rid, label: `Rinnovo ${fmtData(rinnovoDate[rid])}`, files: byRin[rid], data: rinnovoDate[rid] || '' }))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    const out = []
    if (generali.length > 0) out.push({ key: 'generali', label: 'Documenti generali', files: generali })
    out.push(...rinGroups)
    return out
  }, [allegati, rinnovoDate])

  async function scaricaSingolo(a) {
    const { data, error } = await supabase.storage.from('compliance-docs').createSignedUrl(a.path, 60, { download: a.nome })
    if (error) { showToast('Errore: ' + error.message, 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function scaricaTutti() {
    if (allegati.length === 0) return
    setZipStatus('Preparazione…')
    try {
      const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default
      const zip = new JSZip()
      const usedNames = {}
      let done = 0
      for (const a of allegati) {
        const folder = a.rinnovo_id ? `Rinnovo ${rinnovoDate[a.rinnovo_id] || a.rinnovo_id}` : 'Generali'
        const { data, error } = await supabase.storage.from('compliance-docs').createSignedUrl(a.path, 60)
        if (!error && data) {
          try {
            const blob = await (await fetch(data.signedUrl)).blob()
            const set = (usedNames[folder] ||= new Set())
            let nome = a.nome
            if (set.has(nome)) { let i = 1; while (set.has(`${i}_${nome}`)) i++; nome = `${i}_${nome}` }
            set.add(nome)
            zip.file(`${folder}/${nome}`, blob)
          } catch { /* file saltato */ }
        }
        done++
        setZipStatus(`Preparazione… (${done}/${allegati.length})`)
      }
      const out = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(out)
      const link = document.createElement('a')
      link.href = url; link.download = `documenti-${slug(sel.titolo)}.zip`
      document.body.appendChild(link); link.click(); link.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast('Errore ZIP: ' + (e?.message || e), 'error')
    } finally {
      setZipStatus(null)
    }
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/compliance" style={{ color: '#888', textDecoration: 'none' }}>← Scadenziario</Link>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Documenti</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Archivio file per adempimento — pensato per la consultazione da tablet.</div>

      {/* SELETTORE ADEMPIMENTO */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={selStyle}>
            <option value="all">Tutte le categorie</option>
            {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca adempimento…" style={{ ...selStyle, flex: 1, minWidth: 160 }} />
        </div>
        {loadingList ? (
          <div style={{ color: '#888', fontSize: 13 }}>Caricamento...</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {adempimentiFiltrati.map(a => {
              const on = sel?.id === a.id
              return (
                <button key={a.id} onClick={() => seleziona(a)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8,
                  border: `0.5px solid ${on ? '#F5C842' : '#ddd'}`, background: on ? '#FAEEDA' : '#fff',
                  color: on ? '#854F0B' : '#444', cursor: 'pointer', fontSize: 13, fontWeight: on ? 500 : 400,
                }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: a.compliance_categories?.colore || '#ccc' }} />
                  {a.titolo}
                </button>
              )
            })}
            {adempimentiFiltrati.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Nessun adempimento.</div>}
          </div>
        )}
      </div>

      {!sel ? (
        <div className="card" style={{ textAlign: 'center', color: '#888', padding: 28 }}>Scegli un adempimento per vederne i documenti.</div>
      ) : loadingFiles ? (
        <div style={{ padding: 20, color: '#888' }}>Caricamento file...</div>
      ) : (
        <div>
          {/* HEADER ADEMPIMENTO + SCARICA TUTTI */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{sel.titolo} <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>· {allegati.length} file</span></div>
            {allegati.length > 0 && (
              <button className="btn-primary" onClick={scaricaTutti} disabled={!!zipStatus}>
                {zipStatus || 'Scarica tutti (ZIP)'}
              </button>
            )}
          </div>

          {allegati.length === 0 && <div className="card" style={{ color: '#888', fontSize: 13 }}>Nessun documento per questo adempimento.</div>}

          {gruppi.map(g => (
            <div key={g.key} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 8 }}>{g.label} <span style={{ color: '#aaa', fontWeight: 400 }}>({g.files.length})</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {g.files.map(a => (
                  <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div onClick={() => apriAllegato(a.path).then(r => r?.error && showToast(r.error, 'error'))} style={{ cursor: 'pointer', height: 110, background: '#f4f3ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isImage(a.mime) && thumbs[a.path]
                        ? <img src={thumbs[a.path]} alt={a.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 38 }}>{iconaFile(a)}</span>}
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div title={a.nome} style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => apriAllegato(a.path).then(r => r?.error && showToast(r.error, 'error'))}>Apri</button>
                        <button className="btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => scaricaSingolo(a)}>Scarica</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const selStyle = { padding: '8px 10px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff' }
