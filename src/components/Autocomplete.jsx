import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Autocomplete remoto su una tabella di codifica (cod_stati, cod_comuni,
// cod_documenti). L'utente digita la descrizione, sceglie dalla lista,
// onChange riceve (codice, row). La row completa serve al caller per
// derivare campi correlati (es. provincia da cod_comuni).
//
// Caratteristiche:
//   - ilike + limit lato Supabase (no bulk download — cod_comuni ha 11k righe)
//   - debounce 200ms sulla ricerca
//   - mostra label, salva codice
//   - risolve codice→label all'apertura per i valori gia' presenti nel DB
//   - click outside per chiudere
//   - pulsante "×" per pulire la selezione
export default function Autocomplete({
  table,                          // 'cod_stati' | 'cod_comuni' | 'cod_documenti'
  value,                          // codice corrente (string|null)
  onChange,                       // (codice|null, row|null) => void
  placeholder = '',
  searchField = 'descrizione',    // campo su cui fare ilike
  format,                         // (row) => string; default: row.descrizione
  limit = 20,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [resolvedRow, setResolvedRow] = useState(null)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)

  const fmt = format || (r => r?.descrizione || '')

  // Risoluzione lazy: codice salvato -> riga, per mostrare la descrizione
  // nell'input quando carichiamo un member gia' compilato.
  useEffect(() => {
    if (!value) { setResolvedRow(null); return }
    if (resolvedRow?.codice === value) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('codice', value)
        .maybeSingle()
      if (error) {
        // Log esplicito: senza questo gli errori RLS/grant si mangiano in silenzio.
        console.error(`[Autocomplete:${table}] resolve "${value}" failed:`, error)
      }
      if (!cancelled) setResolvedRow(data || null)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, table])

  // Ricerca debounced: gira solo quando il dropdown e' aperto.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      const q = query.trim()
      let req = supabase.from(table).select('*').order(searchField).limit(limit)
      if (q) req = req.ilike(searchField, `%${q}%`)
      const { data, error } = await req
      if (error) {
        console.error(`[Autocomplete:${table}] search "${q}" failed:`, error)
      }
      if (!cancelled) {
        setResults(data || [])
        setLoading(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, open, table, searchField, limit])

  // Click outside chiude il dropdown.
  useEffect(() => {
    function onMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function pick(row) {
    onChange(row.codice, row)
    setResolvedRow(row)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function clearValue(e) {
    e.stopPropagation()
    onChange(null, null)
    setResolvedRow(null)
    setQuery('')
    setOpen(false)
  }

  function onFocus() {
    setOpen(true)
    setQuery('')
  }

  const display = open
    ? query
    : (resolvedRow ? fmt(resolvedRow) : '')

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{ paddingRight: value && resolvedRow ? 30 : undefined }}
        />
        {value && resolvedRow && !open && (
          <button
            type="button"
            onMouseDown={clearValue}
            title="Pulisci"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: '#888', fontSize: 16,
              cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {open && (
        <div style={dropdownStyle}>
          {loading && <div style={emptyStyle}>Cerco…</div>}
          {!loading && results.length === 0 && (
            <div style={emptyStyle}>
              {query.trim() ? `Nessun risultato per "${query}"` : 'Nessun risultato'}
            </div>
          )}
          {!loading && results.map(row => (
            <div
              key={row.codice}
              onMouseDown={(e) => { e.preventDefault(); pick(row) }}
              style={optionStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#FAEEDA'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              {fmt(row)}
            </div>
          ))}
          {!loading && results.length === limit && (
            <div style={{ ...emptyStyle, fontSize: 11, fontStyle: 'italic', borderTop: '0.5px solid #eee' }}>
              Primi {limit} risultati. Affina la ricerca per restringerli.
            </div>
          )}
        </div>
      )}

      {value && resolvedRow && !open && (
        <div className="hint" style={{ marginTop: 4 }}>
          Codice: <span style={{ fontFamily: 'monospace' }}>{value}</span>
        </div>
      )}
    </div>
  )
}

const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0,
  background: '#fff', border: '0.5px solid #ccc', borderRadius: 8,
  marginTop: 4, maxHeight: 260, overflowY: 'auto', zIndex: 100,
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
}
const optionStyle = {
  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
  borderBottom: '0.5px solid #f0f0f0',
}
const emptyStyle = {
  padding: '10px 12px', fontSize: 12, color: '#888', textAlign: 'center',
}
