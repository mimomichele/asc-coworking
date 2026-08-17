// ============================================================
// Passa l'Acqua (admin) — richieste arrivate dalla pagina
// pubblica /passa-lacqua. Fase 2, parte 1: vedere, contattare
// e tracciare. L'inserimento nella griglia della staffetta resta
// manuale (pagina Staffetta): qui NON si scrive mai in
// staffetta_prenotazioni.
//
// Richiede le policy admin della migrazione
// 20260818100000_passa_lacqua_admin_policies.sql: senza, la
// SELECT torna vuota e l'UPDATE non tocca righe — entrambi i
// casi vengono riconosciuti e spiegati a schermo.
//
// Al cambio di stato la pagina emette l'evento
// 'pl-richieste-changed': AdminLayout lo ascolta per aggiornare
// il badge rosso in barra senza aspettare il polling.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export const PL_EVENTO_AGGIORNAMENTO = 'pl-richieste-changed'

const STATI = [
  { key: 'nuova',      label: 'Nuova',      fg: '#854F0B', bg: '#FAEEDA' },
  { key: 'contattata', label: 'Contattata', fg: '#185FA5', bg: '#E6F1FB' },
  { key: 'confermata', label: 'Confermata', fg: '#1E8E3E', bg: '#E6F6EF' },
  { key: 'rifiutata',  label: 'Rifiutata',  fg: '#C5221F', bg: '#FCEBEB' },
]
const statoDi = (k) => STATI.find(s => s.key === k) || STATI[0]

function fmtDataOra(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// "Sab 12 · 23:40" — la griglia attraversa la mezzanotte, il giorno
// serve. Etichette legate all'evento (12-13 settembre), come nel brief.
function fmtTurno(iso) {
  const d = new Date(iso)
  const giorno = d.getDate() === 12 ? 'Sab 12' : 'Dom 13'
  return `${giorno} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function PassaLacquaRichieste() {
  const [richieste, setRichieste] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [filtro, setFiltro] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [opError, setOpError] = useState('')
  const [note, setNote] = useState({})          // id -> testo in modifica
  const [noteSalvate, setNoteSalvate] = useState({}) // id -> true per il flash "salvata"

  useEffect(() => { fetchRichieste() }, [])

  async function fetchRichieste() {
    setLoadError('')
    const { data, error } = await supabase
      .from('passa_lacqua_iscrizioni')
      .select('*, passa_lacqua_turni_richiesti(slot_id, staffetta_slots(inizio))')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[PassaLacquaRichieste]', error)
      setLoadError(error.code === '42P01'
        ? 'Le tabelle delle iscrizioni non esistono: esegui la migrazione della pagina pubblica.'
        : 'Non riesco a caricare le richieste. Riprova.')
      return
    }
    setRichieste(data)
    setNote(n => {
      const next = { ...n }
      for (const r of data) if (next[r.id] === undefined) next[r.id] = r.note_admin || ''
      return next
    })
  }

  async function aggiorna(id, payload, etichetta) {
    setBusyId(id); setOpError('')
    // .select() per contare le righe toccate: se mancano le policy admin
    // l'UPDATE viene scartato in silenzio (204 senza errore)
    const { data, error } = await supabase
      .from('passa_lacqua_iscrizioni')
      .update(payload)
      .eq('id', id)
      .select('id')
    setBusyId(null)
    if (error) {
      console.error(`[PassaLacquaRichieste ${etichetta}]`, error)
      setOpError(`${etichetta} non riuscito. Riprova.`)
      return false
    }
    if (!data || data.length === 0) {
      setOpError('Modifica rifiutata dal database: mancano le policy admin (migrazione 20260818100000).')
      return false
    }
    await fetchRichieste()
    window.dispatchEvent(new Event(PL_EVENTO_AGGIORNAMENTO))
    return true
  }

  async function salvaNota(id) {
    const ok = await aggiorna(id, { note_admin: (note[id] || '').trim() || null }, 'Salvataggio nota')
    if (ok) {
      setNoteSalvate(s => ({ ...s, [id]: true }))
      setTimeout(() => setNoteSalvate(s => ({ ...s, [id]: false })), 2500)
    }
  }

  // nuove prima, poi per data di iscrizione (già desc dal server)
  const visibili = useMemo(() => {
    if (!richieste) return []
    const filtrate = filtro ? richieste.filter(r => r.stato === filtro) : richieste
    return [...filtrate].sort((a, b) =>
      (a.stato === 'nuova' ? 0 : 1) - (b.stato === 'nuova' ? 0 : 1) ||
      (b.created_at || '').localeCompare(a.created_at || ''))
  }, [richieste, filtro])

  const nuove = richieste ? richieste.filter(r => r.stato === 'nuova').length : 0

  if (loadError) return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>{loadError}</div>
      <button className="btn-ghost" onClick={fetchRichieste}>Riprova</button>
    </div>
  )
  if (richieste === null) return <div style={{ padding: 40, color: '#6B6B6B' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Passa l'Acqua</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>
        Richieste dalla pagina pubblica. L'inserimento nella griglia si fa dalla pagina Staffetta.
      </div>

      {nuove > 0 && (
        <div style={S.alertBar}>
          {nuove} {nuove === 1 ? 'nuova richiesta da gestire' : 'nuove richieste da gestire'}
        </div>
      )}
      {opError && <div style={S.errorBar}>{opError}</div>}

      {/* filtro per stato */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <FiltroBtn label="Tutte" attivo={filtro === ''} onClick={() => setFiltro('')} />
        {STATI.map(s => (
          <FiltroBtn key={s.key} label={s.label} attivo={filtro === s.key} onClick={() => setFiltro(s.key)} />
        ))}
      </div>

      {visibili.length === 0 ? (
        <div className="card" style={{ color: '#6B6B6B', fontSize: 13, padding: 16 }}>
          Nessuna richiesta{filtro ? ' in questo stato' : ' per ora. Arriveranno dalla pagina pubblica /passa-lacqua.'}
        </div>
      ) : visibili.map(r => {
        const st = statoDi(r.stato)
        const turni = (r.passa_lacqua_turni_richiesti || [])
          .map(t => t.staffetta_slots?.inizio)
          .filter(Boolean)
          .sort()
        return (
          <div key={r.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.nome_completo}</span>
              <span style={{ ...S.pill, color: st.fg, background: st.bg }}>{st.label}</span>
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
                iscritto il {fmtDataOra(r.created_at)}
              </span>
            </div>

            <div style={S.rigaDati}>
              <a href={`https://wa.me/${r.telefono.replace('+', '')}`} target="_blank" rel="noopener noreferrer" style={S.waLink}>
                💬 {r.telefono}
              </a>
              {r.email && <a href={`mailto:${r.email}`} style={S.mailLink}>{r.email}</a>}
              {r.come_conosciuto && <span style={S.datoSec}>da: {r.come_conosciuto}</span>}
              {r.newsletter_consent && <span style={S.datoSec}>newsletter ✓</span>}
            </div>

            {r.interessi?.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#6B6B6B' }}>Interessi: </span>{r.interessi.join(' · ')}
              </div>
            )}

            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: '#6B6B6B' }}>24 ore: </span>
              {r.partecipa ? <b style={{ color: '#1E8E3E' }}>Sì</b> : 'No'}
              {r.partecipa && (
                turni.length > 0 ? (
                  <span> · turni preferiti:{' '}
                    {turni.map((t, i) => (
                      <span key={i} style={S.turnoChip}>{fmtTurno(t)}</span>
                    ))}
                  </span>
                ) : <span style={{ color: '#6B6B6B' }}> · nessun turno indicato</span>
              )}
            </div>

            {/* cambio stato */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>Stato:</span>
              {STATI.map(s => (
                <button
                  key={s.key}
                  disabled={busyId === r.id || r.stato === s.key}
                  onClick={() => aggiorna(r.id, { stato: s.key }, 'Cambio stato')}
                  style={{
                    ...S.statoBtn,
                    ...(r.stato === s.key
                      ? { background: s.bg, color: s.fg, borderColor: s.fg, fontWeight: 600, cursor: 'default' }
                      : {}),
                    ...(busyId === r.id ? { opacity: 0.55 } : {}),
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* note interne */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={note[r.id] ?? ''}
                onChange={e => setNote(n => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Note interne (es. richiamare dopo le 18)"
                rows={1}
                style={S.noteArea}
              />
              <button
                className="btn-ghost"
                disabled={busyId === r.id || (note[r.id] ?? '') === (r.note_admin || '')}
                onClick={() => salvaNota(r.id)}
                style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              >
                {noteSalvate[r.id] ? '✓ Salvata' : 'Salva nota'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FiltroBtn({ label, attivo, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
      fontFamily: 'inherit', fontWeight: 500,
      background: attivo ? '#F5B301' : '#fff',
      border: attivo ? '1px solid #111111' : '0.5px solid #E5E3DC',
      color: '#111111',
    }}>
      {label}
    </button>
  )
}

const S = {
  alertBar: {
    background: '#FCEBEB', borderRadius: 8, padding: '10px 14px',
    fontSize: 13, color: '#C5221F', fontWeight: 500, marginBottom: 12,
  },
  errorBar: {
    background: '#FCEBEB', borderRadius: 8, padding: '10px 14px',
    fontSize: 13, color: '#C5221F', marginBottom: 12,
  },
  pill: {
    borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  rigaDati: {
    display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
    fontSize: 13, marginBottom: 8,
  },
  waLink: { color: '#1E8E3E', fontWeight: 600, textDecoration: 'none' },
  mailLink: { color: '#185FA5', textDecoration: 'none' },
  datoSec: { color: '#6B6B6B', fontSize: 12 },
  turnoChip: {
    display: 'inline-block', background: '#F6F5F1', border: '0.5px solid #E5E3DC',
    borderRadius: 6, padding: '1px 7px', fontSize: 12, margin: '0 3px 3px 0',
    fontVariantNumeric: 'tabular-nums',
  },
  statoBtn: {
    padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    background: '#fff', border: '0.5px solid #E5E3DC', color: '#111111', fontFamily: 'inherit',
  },
  noteArea: {
    flex: 1, padding: '8px 10px', borderRadius: 8, border: '0.5px solid #E5E3DC',
    fontFamily: 'inherit', fontSize: 13, resize: 'vertical', minHeight: 36,
  },
}
