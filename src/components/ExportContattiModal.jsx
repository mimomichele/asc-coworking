// ============================================================
// ExportContattiModal — modal in Ospiti per esportare i contatti
// dell'admin verso vCard 3.0 (rubrica iPhone/Google) e CSV
// (Excel italiano). Filtri per stato abbonamento, tag
// personalizzato, anteprima live con elenco saltati.
//
// Props:
//   accounts: array (preso da Ospiti.jsx, gia' con members + subscriptions)
//   onClose: () => void
// ============================================================

import { useMemo, useState } from 'react'
import {
  sanitizeTag, buildContactList,
  toVcf, toCsv, downloadBlob, filenameFor,
} from '../lib/exportContatti'

const FILTRI = [
  { value: 'tutti',          label: 'Tutti' },
  { value: 'attivi',         label: 'Solo con abbonamento attivo' },
  { value: 'in_esaurimento', label: 'Solo in esaurimento' },
  { value: 'esauriti',       label: 'Solo esauriti' },
]

export default function ExportContattiModal({ accounts, onClose }) {
  const [filter, setFilter] = useState('tutti')
  const [tag, setTag] = useState('COW2025')

  // Il campo tag mostra sempre il valore sanificato (uppercase + [A-Z0-9]).
  // L'utente vede in tempo reale cosa finira' in rubrica / nel nome file.
  function onTagChange(e) {
    setTag(sanitizeTag(e.target.value))
  }

  // Anteprima calcolata al volo su ogni change (accounts/filter/tag).
  const { contacts, skipped, tagClean } = useMemo(
    () => buildContactList(accounts, filter, tag),
    [accounts, filter, tag]
  )

  function scaricaVcf() {
    if (contacts.length === 0) return
    downloadBlob(toVcf(contacts), filenameFor(tagClean, 'vcf'), 'text/vcard;charset=utf-8')
  }

  function scaricaCsv() {
    if (contacts.length === 0) return
    // UTF-8 BOM + CRLF gia' inclusi nel content
    downloadBlob(toCsv(contacts), filenameFor(tagClean, 'csv'), 'text/csv;charset=utf-8')
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <h3 style={S.title}>Esporta contatti</h3>
          <button onClick={onClose} style={S.closeBtn} aria-label="Chiudi">✕</button>
        </div>

        <div style={S.section}>
          <label style={S.lbl}>Chi esportare</label>
          <div style={S.filtriGroup}>
            {FILTRI.map(f => (
              <label key={f.value} style={S.filtroLine}>
                <input
                  type="radio"
                  name="export-filter"
                  value={f.value}
                  checked={filter === f.value}
                  onChange={() => setFilter(f.value)}
                  style={{ marginRight: 8 }}
                />
                <span style={{ fontSize: 13 }}>{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={S.section}>
          <label style={S.lbl}>
            Tag <span style={S.lblHint}>(finisce nel nome contatto e nel nome file)</span>
          </label>
          <input
            type="text"
            value={tag}
            onChange={onTagChange}
            placeholder="COW2025"
            style={S.inp}
            maxLength={30}
          />
          <div style={S.hint}>
            Es. nome contatto: <strong>Mario Rossi {tagClean}</strong>
          </div>
        </div>

        <div style={S.previewBox}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            Esporterai <strong>{contacts.length}</strong>{' '}
            contatt{contacts.length === 1 ? 'o' : 'i'}
          </div>
          {skipped.length > 0 && (
            <details style={S.skipped}>
              <summary style={S.skippedSummary}>
                {skipped.length} saltat{skipped.length === 1 ? 'o' : 'i'} — mostra dettagli
              </summary>
              <ul style={S.skippedList}>
                {skipped.map((s, i) => (
                  <li key={i} style={S.skippedItem}>
                    <span style={{ fontWeight: 500 }}>{s.nome}</span> — {s.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div style={S.actions}>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button
            className="btn-primary"
            onClick={scaricaCsv}
            disabled={contacts.length === 0}
            style={{ opacity: contacts.length === 0 ? 0.5 : 1 }}
          >
            Scarica .csv
          </button>
          <button
            className="btn-primary"
            onClick={scaricaVcf}
            disabled={contacts.length === 0}
            style={{ opacity: contacts.length === 0 ? 0.5 : 1 }}
          >
            Scarica .vcf (rubrica)
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: 24,
    width: 'min(560px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 500, margin: 0 },
  closeBtn: {
    background: 'transparent', border: 'none', fontSize: 20, color: '#6B6B6B',
    cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  section: { marginBottom: 16 },
  lbl: { display: 'block', fontSize: 12, color: '#6B6B6B', marginBottom: 6, fontWeight: 500 },
  lblHint: { fontWeight: 400, opacity: 0.85 },
  filtriGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  filtroLine: {
    display: 'flex', alignItems: 'center', padding: '6px 10px',
    borderRadius: 8, cursor: 'pointer',
  },
  inp: {
    width: '100%', padding: '9px 12px', border: '0.5px solid #E5E3DC',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
    background: '#fff', color: '#111111', outline: 'none', letterSpacing: 0.5,
  },
  hint: { fontSize: 11, color: '#6B6B6B', marginTop: 6 },
  previewBox: {
    padding: 14, background: '#FAEEDA', borderRadius: 10, marginBottom: 16,
    color: '#854F0B',
  },
  skipped: { marginTop: 10, fontSize: 12 },
  skippedSummary: {
    cursor: 'pointer', color: '#854F0B', fontWeight: 500, padding: '4px 0',
  },
  skippedList: {
    margin: '8px 0 0 0', paddingLeft: 20, maxHeight: 180, overflowY: 'auto',
  },
  skippedItem: { color: '#111111', marginBottom: 4 },
  actions: {
    display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap',
  },
}
