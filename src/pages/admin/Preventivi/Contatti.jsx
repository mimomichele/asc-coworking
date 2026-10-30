// ============================================================
// Preventivi > Contatti
//
// Rubrica dei richiedenti con ricerca, filtri (anno/tipologia/
// consenso marketing) e export .csv / .vcf. Il nome dei file
// e del contatto nel VCF riceve il tag "PREV<anno>" (es.
// "PREV2026") sul modello dell'export coworking.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  TIPOLOGIE, tipologiaLabel, etichettaContatto, fmtData,
} from '../../../lib/preventivi'

const ANNO_ORA = new Date().getFullYear()
const ANNI = [ANNO_ORA, ANNO_ORA - 1, ANNO_ORA - 2]

export default function Contatti() {
  const [contatti, setContatti] = useState(null)
  const [search, setSearch] = useState('')
  const [filtroAnno, setFiltroAnno] = useState('')         // '' = tutti
  const [filtroTipologia, setFiltroTipologia] = useState('')
  const [filtroConsenso, setFiltroConsenso] = useState('all') // all | yes
  const [err, setErr] = useState('')
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setErr('')
    const { data, error } = await supabase
      .from('contatti')
      .select(`id, nome, cognome, societa_ente, email, telefono,
               consenso_marketing, created_at, member_id,
               richieste:richieste_preventivo(tipologia, data_ricevuta)`)
      .order('cognome', { ascending: true, nullsFirst: false })
    if (error) {
      setErr(error.code === '42P01'
        ? 'Le tabelle Preventivi non esistono: applica la migrazione.'
        : 'Errore nel caricamento.')
      return
    }
    setContatti(data || [])
  }

  const visibili = useMemo(() => {
    if (!contatti) return []
    const q = search.trim().toLowerCase()
    return contatti.filter(c => {
      if (q) {
        const hay = [c.nome, c.cognome, c.societa_ente, c.email, c.telefono]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filtroConsenso === 'yes' && !c.consenso_marketing) return false
      const rich = c.richieste || []
      if (filtroAnno) {
        const trovato = rich.some(r => r.data_ricevuta?.startsWith(filtroAnno))
        if (!trovato) return false
      }
      if (filtroTipologia) {
        const trovato = rich.some(r => r.tipologia === filtroTipologia)
        if (!trovato) return false
      }
      return true
    })
  }, [contatti, search, filtroAnno, filtroTipologia, filtroConsenso])

  // --- Export helpers ------------------------------------------
  // Il tag "PREV<anno>" entra nel nome visualizzato del contatto,
  // identico al pattern coworking: facilita la pulizia in rubrica.
  function tagAnno() {
    const anno = filtroAnno || String(ANNO_ORA)
    return `PREV${anno}`
  }

  function esportaCsv() {
    const tag = tagAnno()
    const intest = ['Nome', 'Cognome', 'Società', 'Email', 'Telefono',
      'Consenso marketing', 'Richieste', 'Primo contatto', 'Tag']
    const cella = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const righe = visibili.map(c => {
      const n = (c.richieste || []).length
      const primo = (c.richieste || []).map(r => r.data_ricevuta).filter(Boolean).sort()[0]
      return [c.nome, c.cognome || '', c.societa_ente || '',
              c.email || '', c.telefono || '',
              c.consenso_marketing ? 'Sì' : 'No', n,
              primo ? fmtData(primo.slice(0, 10)) : '', tag]
        .map(cella).join(';')
    })
    const csv = '﻿' + [intest.map(cella).join(';'), ...righe].join('\r\n')
    download(csv, `contatti-asc-${tag}-${new Date().toISOString().slice(0, 10)}.csv`,
             'text/csv;charset=utf-8')
  }

  function esportaVcf() {
    const tag = tagAnno()
    const vcards = visibili.map(c => {
      const fn = [c.nome, c.cognome, c.societa_ente ? `(${c.societa_ente})` : null, tag]
        .filter(Boolean).join(' ')
      const n = `${c.cognome || ''};${c.nome || ''};;;`
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${n}`, `FN:${fn}`]
      if (c.societa_ente) lines.push(`ORG:${c.societa_ente}`)
      if (c.email)        lines.push(`EMAIL;TYPE=INTERNET:${c.email}`)
      if (c.telefono)     lines.push(`TEL;TYPE=CELL:${c.telefono}`)
      lines.push(`NOTE:Contatto ASC – ${tag}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    })
    download(vcards.join('\r\n') + '\r\n',
             `contatti-asc-${tag}-${new Date().toISOString().slice(0, 10)}.vcf`,
             'text/vcard;charset=utf-8')
  }

  function download(contents, filename, mime) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (err) return (
    <div style={{ padding: 20 }}>
      <div>{err}</div>
      <button className="btn-ghost" onClick={fetchAll} style={{ marginTop: 10 }}>Riprova</button>
    </div>
  )
  if (contatti === null) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Contatti</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 16 }}>
        {contatti.length} totali · {visibili.length} con filtri correnti
      </div>

      {/* Filtri */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={styles.filterRow}>
          <input type="text" placeholder="Cerca…"
                 value={search} onChange={e => setSearch(e.target.value)}
                 style={styles.input} />
          <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
                  style={styles.select}>
            <option value="">Qualsiasi anno</option>
            {ANNI.map(a => <option key={a} value={String(a)}>{a}</option>)}
          </select>
          <select value={filtroTipologia} onChange={e => setFiltroTipologia(e.target.value)}
                  style={styles.select}>
            <option value="">Qualsiasi tipologia</option>
            {TIPOLOGIE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={filtroConsenso} onChange={e => setFiltroConsenso(e.target.value)}
                  style={styles.select}>
            <option value="all">Marketing: tutti</option>
            <option value="yes">Solo con consenso</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn-ghost" onClick={esportaCsv} disabled={visibili.length === 0}>
            ⬇ CSV ({visibili.length})
          </button>
          <button className="btn-ghost" onClick={esportaVcf} disabled={visibili.length === 0}>
            ⬇ VCF ({visibili.length})
          </button>
        </div>
      </div>

      {visibili.length === 0 ? (
        <div className="card" style={{ padding: 16, color: '#6B6B6B', fontSize: 13 }}>
          Nessun contatto coi filtri correnti.
        </div>
      ) : visibili.map(c => {
        const n = (c.richieste || []).length
        return (
          <Link key={c.id} to={`/admin/preventivi/contatti/${c.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ padding: 12, marginBottom: 6, display: 'flex',
                                           alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{etichettaContatto(c)}</span>
              {c.consenso_marketing && <span style={styles.chip}>mkt ✓</span>}
              {c.member_id && <span style={styles.chip}>coworking</span>}
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                {c.email || c.telefono || '—'}
              </span>
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
                {n} richiest{n === 1 ? 'a' : 'e'}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

const styles = {
  filterRow: {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
    marginBottom: 6,
  },
  input: {
    flex: '1 1 220px', minWidth: 160, padding: '7px 10px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
  },
  select: {
    padding: '6px 8px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
  },
  chip: {
    fontSize: 11, padding: '2px 8px', borderRadius: 999,
    background: '#F6F5F1', color: '#6B6B6B',
  },
}
