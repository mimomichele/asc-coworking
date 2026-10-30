// ============================================================
// Preventivi > Tutte
//
// Lista filtrabile per stato, tipologia, canale, operatore,
// periodo (data_ricevuta). Ricerca testuale su nome, societa',
// email, telefono del contatto.
//
// Indicatore sommato in alto: "importo preventivi in sospeso"
// = somma di importo_preventivo per richieste in stato
// inviato|attesa (filtrate come la lista visibile).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  STATI, TIPOLOGIE, CANALI, fmtData, fmtEuro,
  fmtDataRange, etichettaContatto, canaleLabel,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'

const SELECT = `
  id, tipologia, canale, data_arrivo, data_partenza, periodo_note,
  n_persone, stato, importo_preventivo, data_invio, data_ricevuta,
  contatto:contatti!inner(id, nome, cognome, societa_ente, email, telefono)
`

export default function PreventiviTutte() {
  const [righe, setRighe] = useState(null)
  const [err, setErr] = useState('')
  const [stato, setStato] = useState('')
  const [tipologia, setTipologia] = useState('')
  const [canale, setCanale] = useState('')
  const [periodo, setPeriodo] = useState({ da: '', a: '' })
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('ricevuta_desc')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setErr('')
    const { data, error } = await supabase
      .from('richieste_preventivo')
      .select(SELECT)
      .order('data_ricevuta', { ascending: false })
    if (error) {
      setErr(error.code === '42P01'
        ? 'Le tabelle Preventivi non esistono: applica la migrazione.'
        : 'Errore nel caricamento.')
      return
    }
    setRighe(data || [])
  }

  const visibili = useMemo(() => {
    if (!righe) return []
    const q = search.trim().toLowerCase()
    const list = righe.filter(r => {
      if (stato && r.stato !== stato) return false
      if (tipologia && r.tipologia !== tipologia) return false
      if (canale && r.canale !== canale) return false
      if (periodo.da && r.data_ricevuta?.slice(0, 10) < periodo.da) return false
      if (periodo.a  && r.data_ricevuta?.slice(0, 10) > periodo.a)  return false
      if (q) {
        const c = r.contatto || {}
        const hay = [c.nome, c.cognome, c.societa_ente, c.email, c.telefono]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    list.sort((a, b) => {
      switch (sortBy) {
        case 'ricevuta_asc':  return (a.data_ricevuta || '').localeCompare(b.data_ricevuta || '')
        case 'ricevuta_desc': return (b.data_ricevuta || '').localeCompare(a.data_ricevuta || '')
        case 'importo_desc':  return Number(b.importo_preventivo || 0) - Number(a.importo_preventivo || 0)
        case 'arrivo_asc':    return (a.data_arrivo || '9999').localeCompare(b.data_arrivo || '9999')
        default: return 0
      }
    })
    return list
  }, [righe, stato, tipologia, canale, periodo, search, sortBy])

  const importoSospeso = useMemo(() => visibili
    .filter(r => r.stato === 'inviato' || r.stato === 'attesa')
    .reduce((s, r) => s + Number(r.importo_preventivo || 0), 0),
  [visibili])

  if (err) return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>{err}</div>
      <button className="btn-ghost" onClick={fetchAll}>Riprova</button>
    </div>
  )
  if (righe === null) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Tutte le richieste</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 12 }}>
        {visibili.length} richiest{visibili.length === 1 ? 'a' : 'e'} ·
        {' '}in sospeso (inviate/attesa): <b>{fmtEuro(importoSospeso)}</b>
      </div>

      {/* Filtri */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={styles.filterRow}>
          <input
            type="text" placeholder="Cerca nome, società, email, telefono…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={styles.input}
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={styles.select}>
            <option value="ricevuta_desc">Arrivo più recente</option>
            <option value="ricevuta_asc">Arrivo più vecchio</option>
            <option value="arrivo_asc">Prossimi soggiorni</option>
            <option value="importo_desc">Importo decrescente</option>
          </select>
        </div>

        <div style={styles.filterRow}>
          <SelectMini label="Stato" value={stato} onChange={setStato}
                      options={[{ key: '', label: 'Tutti' }, ...STATI]} />
          <SelectMini label="Tipologia" value={tipologia} onChange={setTipologia}
                      options={[{ key: '', label: 'Tutte' }, ...TIPOLOGIE]} />
          <SelectMini label="Canale" value={canale} onChange={setCanale}
                      options={[{ key: '', label: 'Tutti' }, ...CANALI]} />
          <div style={styles.datoRange}>
            <span style={styles.labelSmall}>Dal</span>
            <input type="date" value={periodo.da}
                   onChange={e => setPeriodo(p => ({ ...p, da: e.target.value }))}
                   style={styles.inputDate} />
            <span style={styles.labelSmall}>Al</span>
            <input type="date" value={periodo.a}
                   onChange={e => setPeriodo(p => ({ ...p, a: e.target.value }))}
                   style={styles.inputDate} />
          </div>
        </div>
      </div>

      {visibili.length === 0 ? (
        <div className="card" style={{ padding: 16, color: '#6B6B6B', fontSize: 13 }}>
          Nessuna richiesta coi filtri correnti.
        </div>
      ) : visibili.map(r => (
        <Link key={r.id} to={`/admin/preventivi/richiesta/${r.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{etichettaContatto(r.contatto)}</span>
              <PreventivoStatoBadge stato={r.stato} compact />
              <span style={styles.chip}>{canaleLabel(r.canale)}</span>
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
                ricevuta {fmtData(r.data_ricevuta?.slice(0, 10))}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#333' }}>
              {fmtDataRange(r.data_arrivo, r.data_partenza) || r.periodo_note || 'Date da definire'}
              {r.n_persone ? ` · ${r.n_persone} persone` : ''}
              {r.importo_preventivo ? ` · ${fmtEuro(r.importo_preventivo)}` : ''}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function SelectMini({ label, value, onChange, options }) {
  return (
    <label style={styles.selectWrap}>
      <span style={styles.labelSmall}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={styles.select}>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  )
}

const styles = {
  filterRow: {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    flex: '1 1 220px', minWidth: 180, padding: '7px 10px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
  },
  inputDate: {
    padding: '5px 8px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
  },
  select: {
    padding: '6px 8px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
  },
  selectWrap: { display: 'flex', gap: 6, alignItems: 'center' },
  labelSmall: { fontSize: 11.5, color: '#6B6B6B' },
  datoRange: {
    display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
  },
  chip: {
    fontSize: 11.5, padding: '2px 8px', borderRadius: 999,
    background: '#F6F5F1', color: '#6B6B6B',
  },
}
