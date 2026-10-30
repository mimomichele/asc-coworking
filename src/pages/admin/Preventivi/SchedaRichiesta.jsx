// ============================================================
// Preventivi > scheda richiesta
//
// Tutti i campi editabili con salvataggio inline, storico del
// contatto (altre richieste con esito), log eventi, bozza di
// risposta editabile + "Rigenera bozza" via edge function.
//
// Pulsanti principali:
//   - Apri in Gmail: imposta stato='inviato' PRIMA di aprire la
//     finestra di compose. Se gia' inviato, apre solo la finestra.
//   - Ricontattato: aggiorna data_ultimo_contatto + log follow_up.
//   - Prenotato su Krossbooking: inserisce il numero di
//     prenotazione (vincolo DB) e passa a 'confermata'.
//   - Cambia stato: dropdown con conferma per 'persa' (richiede
//     motivo) e per 'confermata' (richiede ref Krossbooking).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  STATI, TIPOLOGIE, CANALI, SERVIZI, MOTIVI_PERDITA,
  statoDi, tipologiaLabel, canaleLabel, serviziLabel,
  motivoLabel, fmtData, fmtDataOra, fmtEuro, fmtDataRange,
  etichettaContatto, urlGmailCompose, urlGmailThread, suggerisciOggetto,
  PREV_EVENTO_AGGIORNAMENTO,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'
import PreventivoFaseChip from '../../../components/PreventivoFaseChip.jsx'
import ImportoMancanteBadge from '../../../components/ImportoMancanteBadge.jsx'

const SELECT_FULL = `
  *,
  contatto:contatti!inner(*,
    altre:richieste_preventivo(id, tipologia, stato, data_arrivo, data_partenza, data_ricevuta, importo_preventivo)
  ),
  eventi:richieste_eventi(id, tipo, da_stato, a_stato, testo, created_at,
                          utente:profiles!richieste_eventi_utente_id_fkey(nome, cognome))
`

// Riuso selezionato senza profiles join (non sappiamo quale fk esista nel DB
// del progetto). Fallback: carichiamo gli eventi senza utenti e stampiamo l'id.
const SELECT_SAFE = `
  *,
  contatto:contatti!inner(*,
    altre:richieste_preventivo(id, tipologia, stato, data_arrivo, data_partenza, data_ricevuta, importo_preventivo)
  ),
  eventi:richieste_eventi(id, utente_id, tipo, da_stato, a_stato, testo, created_at),
  messaggi:richieste_messaggi(id, direzione, from_name, from_email, subject, testo, snippet, data)
`

export default function SchedaRichiesta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [salva, setSalva] = useState(null)   // messaggio "salvato" transitorio
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState({})     // modifiche non salvate
  const [bozza, setBozza] = useState('')
  const [bozzaDirty, setBozzaDirty] = useState(false)
  const [rigenerando, setRigenerando] = useState(false)
  const [modalConferma, setModalConferma] = useState(null) // {tipo, ...}
  const [syncing, setSyncing] = useState(false)
  const [importoLocal, setImportoLocal] = useState('')   // campo accanto alle azioni
  const [chiediImporto, setChiediImporto] = useState(false) // prompt inline prima di Gmail

  useEffect(() => { fetchRichiesta() }, [id])

  // Realtime: quando il sync Make aggiunge messaggi a questa richiesta
  // (o aggiorna la riga), la scheda si ricarica da sola.
  useEffect(() => {
    const channel = supabase
      .channel(`preventivo-${id}-live`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'richieste_messaggi', filter: `richiesta_id=eq.${id}` },
        () => { fetchRichiesta() })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'richieste_preventivo', filter: `id=eq.${id}` },
        () => { fetchRichiesta() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function fetchRichiesta() {
    setErr('')
    const { data, error } = await supabase
      .from('richieste_preventivo')
      .select(SELECT_SAFE)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[SchedaRichiesta]', error)
      setErr('Errore nel caricamento.')
      return
    }
    if (!data) { setErr('Richiesta non trovata.'); return }
    setR(data)
    setEdits({})
    setBozza(data.bozza_risposta || '')
    setBozzaDirty(false)
    setImportoLocal(data.importo_preventivo ?? '')
  }

  function flashSalva(txt = 'Salvato') {
    setSalva(txt)
    setTimeout(() => setSalva(null), 2200)
  }

  async function aggiorna(payload, etichetta = 'Aggiornamento') {
    setBusy(true); setErr('')
    const { data, error } = await supabase
      .from('richieste_preventivo')
      .update(payload)
      .eq('id', id)
      .select('id')
    setBusy(false)
    if (error) {
      console.error(`[Scheda ${etichetta}]`, error)
      setErr(`${etichetta}: ${error.message}`)
      return false
    }
    if (!data || data.length === 0) {
      setErr('Modifica rifiutata (manca permesso admin?).')
      return false
    }
    await fetchRichiesta()
    window.dispatchEvent(new Event(PREV_EVENTO_AGGIORNAMENTO))
    flashSalva()
    return true
  }

  function cambiaCampo(k, v) {
    setEdits(e => ({ ...e, [k]: v }))
  }

  async function salvaCampo(k) {
    if (!(k in edits)) return
    const v = edits[k]
    const nuovo = { ...edits }; delete nuovo[k]
    const ok = await aggiorna({ [k]: v }, `Salvataggio ${k}`)
    if (ok) setEdits(nuovo)
  }

  async function salvaTutti() {
    if (Object.keys(edits).length === 0) return
    const ok = await aggiorna(edits, 'Salvataggio')
    if (ok) setEdits({})
  }

  // --- apri in Gmail ------------------------------------------
  // 1) se stato = 'ricevuta', aggiorna PRIMA stato=inviato +
  //    operatore_invio (data_invio la mette il trigger)
  // 2) poi apre https://mail.google.com/mail/?view=cm... in nuova tab
  // Richiesta arrivata via email: apriamo la CONVERSAZIONE originale in
  // Gmail (non un nuovo messaggio), cosi' la risposta resta nello stesso
  // thread del cliente, con la bozza copiata negli appunti. Richiesta
  // manuale: compose nuovo con tutto precompilato.
  //
  // window.open deve avvenire in modo SINCRONO dentro il click: dopo un
  // await il browser lo considera un popup non richiesto e lo blocca.
  // Per questo lo stato passa a 'inviato' solo DOPO, e solo se la
  // finestra si e' davvero aperta. Se manca l'importo, al primo click
  // mostriamo il prompt inline: sara' il click sul prompt ad aprire Gmail.
  function apriInGmail({ conImporto = null, salta = false } = {}) {
    const to = r.contatto?.email
    const corpo = bozza || r.bozza_risposta || ''
    const haThread = !!(r.email_origine_thread_id || r.email_origine_id)
    if (!to && !haThread) {
      setErr('Il contatto non ha email, non posso aprire Gmail.')
      return
    }

    const importoStr = conImporto ?? importoLocal
    const importoVal = importoStr === '' || importoStr === null ? null : Number(importoStr)
    if (importoVal === null && !salta && conImporto === null) {
      setChiediImporto(true)
      return
    }

    const url = haThread
      ? urlGmailThread({ threadId: r.email_origine_thread_id, messageId: r.email_origine_id })
      : urlGmailCompose({ to, oggetto: suggerisciOggetto(r, r.contatto), corpo })
    // Niente 'noopener' nel terzo argomento: farebbe tornare sempre null
    // e non sapremmo se il popup e' stato bloccato. Lo azzeriamo a mano.
    const win = window.open(url, '_blank')
    if (!win) {
      setErr('Il browser ha bloccato l’apertura di Gmail: consenti i popup per co.aschotel.com e riprova.')
      return
    }
    try { win.opener = null } catch { /* ignora */ }
    setChiediImporto(false)
    setErr('')

    if (haThread && corpo && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(corpo).then(
        () => flashSalva('Bozza copiata negli appunti: in Gmail premi Rispondi e incolla.'),
        () => flashSalva('Conversazione aperta in Gmail: premi Rispondi.'),
      )
    }

    // Finestra aperta: ora stato, importo e bozza (un solo update).
    ;(async () => {
      const payload = {}
      if (r.stato === 'ricevuta' || r.stato === 'scaduta') {
        payload.stato = 'inviato'
        payload.operatore_invio = (await supabase.auth.getUser()).data.user?.id ?? null
        if (bozzaDirty) payload.bozza_risposta = bozza
      }
      if (importoVal !== null && Number.isFinite(importoVal) && importoVal !== Number(r.importo_preventivo)) {
        payload.importo_preventivo = importoVal
      }
      if (Object.keys(payload).length > 0) await aggiorna(payload, 'Apertura Gmail')
    })()
  }

  async function salvaImporto() {
    const val = importoLocal === '' ? null : Number(importoLocal)
    if (val !== null && !Number.isFinite(val)) return
    const attuale = r.importo_preventivo === null || r.importo_preventivo === undefined ? null : Number(r.importo_preventivo)
    if (val === attuale) return
    await aggiorna({ importo_preventivo: val }, 'Importo')
  }

  // Forza il sync della conversazione (scenario Make "Sync conversazioni");
  // i messaggi nuovi arrivano via realtime pochi secondi dopo.
  async function aggiornaConversazione() {
    setSyncing(true); setErr('')
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    if (!token) { setSyncing(false); setErr('Sessione scaduta.'); return }
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preventivi-importa-ora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ solo: 'sync' }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      flashSalva('Sincronizzazione avviata: i nuovi messaggi compaiono fra pochi secondi.')
    } catch (e) {
      setErr(`Aggiorna conversazione: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function tornaIndietroRicevuta() {
    if (r.stato !== 'inviato' && r.stato !== 'attesa') return
    // operatore_invio e data_invio restano a riferimento storico,
    // non li svuotiamo: la reception vuole poter rifare "Apri in
    // Gmail" senza perdere chi aveva mandato (ipotesi: errore umano).
    await aggiorna({ stato: 'ricevuta' }, 'Rollback stato')
  }

  async function ricontattato() {
    const ora = new Date().toISOString()
    const ok = await aggiorna({ data_ultimo_contatto: ora }, 'Ricontattato')
    if (ok) {
      await supabase.from('richieste_eventi').insert({
        richiesta_id: id, tipo: 'ricontattato',
        testo: 'Follow-up effettuato',
      })
      fetchRichiesta()
    }
  }

  async function rigeneraBozza() {
    setRigenerando(true); setErr('')
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    if (!token) { setRigenerando(false); setErr('Sessione scaduta.'); return }
    const url =
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preventivi-rigenera-bozza`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ richiesta_id: id }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      setBozza(data.bozza || '')
      setBozzaDirty(false)
      flashSalva('Bozza rigenerata')
      fetchRichiesta()
    } catch (e) {
      setErr(`Rigenera bozza: ${e.message}`)
    } finally {
      setRigenerando(false)
    }
  }

  async function salvaBozza() {
    const ok = await aggiorna({ bozza_risposta: bozza }, 'Salvataggio bozza')
    if (ok) setBozzaDirty(false)
  }

  // --- Eliminazione definitiva (con conferma) ------------------
  async function eliminaRichiesta() {
    const ok = window.confirm(
      'Eliminare definitivamente questa richiesta?\nL\'operazione non si puo\' annullare.'
    )
    if (!ok) return
    setBusy(true); setErr('')
    const { error } = await supabase
      .from('richieste_preventivo')
      .delete()
      .eq('id', id)
    setBusy(false)
    if (error) {
      setErr(`Eliminazione: ${error.message}`)
      return
    }
    window.dispatchEvent(new Event(PREV_EVENTO_AGGIORNAMENTO))
    navigate('/admin/preventivi')
  }

  // --- cambio stato con dialog ---------------------------------
  function proponiCambioStato(nuovoStato) {
    if (nuovoStato === r.stato) return
    if (nuovoStato === 'persa') {
      setModalConferma({ tipo: 'persa', motivo: 'nessuna_risposta', note: '' })
    } else if (nuovoStato === 'confermata') {
      setModalConferma({ tipo: 'confermata', ref: r.krossbooking_ref || '' })
    } else {
      aggiorna({ stato: nuovoStato }, 'Cambio stato')
    }
  }

  async function confermaPersa() {
    const ok = await aggiorna({
      stato: 'persa',
      motivo_perdita: modalConferma.motivo,
      motivo_perdita_note: modalConferma.note || null,
    }, 'Persa')
    if (ok) setModalConferma(null)
  }

  async function confermaKrossbooking() {
    if (!modalConferma.ref.trim()) {
      setErr('Inserisci il numero di prenotazione Krossbooking.')
      return
    }
    const ok = await aggiorna({
      stato: 'confermata',
      krossbooking_ref: modalConferma.ref.trim(),
    }, 'Krossbooking')
    if (ok) setModalConferma(null)
  }

  const altreRichieste = useMemo(() => {
    if (!r?.contatto?.altre) return []
    return r.contatto.altre
      .filter(a => a.id !== r.id)
      .sort((a, b) => (b.data_ricevuta || '').localeCompare(a.data_ricevuta || ''))
  }, [r])

  if (err && !r) return (
    <div style={{ padding: 20 }}>
      <div>{err}</div>
      <Link to="/admin/preventivi" className="btn-ghost" style={{ marginTop: 12, display: 'inline-block' }}>
        ← Torna
      </Link>
    </div>
  )
  if (!r) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  const c = r.contatto || {}
  const st = statoDi(r.stato)
  const dirty = Object.keys(edits).length > 0

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin/preventivi" style={{ fontSize: 13, color: '#6B6B6B', textDecoration: 'none' }}>
          ← Preventivi
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            {etichettaContatto(c)}
          </h2>
          <PreventivoStatoBadge stato={r.stato} />
          <PreventivoFaseChip richiesta={r} />
        </div>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
          Ricevuta il {fmtDataOra(r.data_ricevuta)}
          {r.data_invio ? ` · inviata il ${fmtDataOra(r.data_invio)}` : ''}
          {r.data_chiusura ? ` · chiusa il ${fmtDataOra(r.data_chiusura)}` : ''}
        </div>
      </div>

      {err && <div style={styles.errorBar}>{err}</div>}
      {salva && <div style={styles.okBar}>{salva}</div>}

      {/* Importo: accanto alle azioni, non sepolto nel form dati */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 12.5, color: '#6B6B6B' }}>Importo preventivo (€)</label>
        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="es. 1250"
               value={importoLocal}
               onChange={e => setImportoLocal(e.target.value)}
               onBlur={salvaImporto}
               style={{ ...styles.input, width: 140 }} />
        <ImportoMancanteBadge richiesta={r} />
      </div>

      {chiediImporto && (
        <div style={styles.promptBox}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Quanto hai preventivato? (€)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min="0" step="0.01" inputMode="decimal" autoFocus
                   value={importoLocal}
                   onChange={e => setImportoLocal(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') apriInGmail({ conImporto: importoLocal }) }}
                   style={{ ...styles.input, width: 140 }} />
            <button className="btn-primary" onClick={() => apriInGmail({ conImporto: importoLocal })}>
              Salva e apri Gmail
            </button>
            <button className="btn-ghost" onClick={() => apriInGmail({ salta: true })}>
              Apri senza importo
            </button>
          </div>
        </div>
      )}

      {/* Azioni rapide */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn-primary" onClick={() => apriInGmail()}
                disabled={busy || (!c.email && !r.email_origine_thread_id && !r.email_origine_id)}>
          {(r.email_origine_thread_id || r.email_origine_id) ? '✉ Rispondi in Gmail' : '✉ Apri in Gmail'}
        </button>
        <button className="btn-ghost" onClick={ricontattato} disabled={busy}>
          Ricontattato
        </button>
        <button className="btn-ghost"
                onClick={() => setModalConferma({ tipo: 'confermata', ref: r.krossbooking_ref || '' })}
                disabled={busy}>
          Prenotato su Krossbooking
        </button>
        {(r.stato === 'inviato' || r.stato === 'attesa') && (
          <button className="btn-ghost" onClick={tornaIndietroRicevuta} disabled={busy}>
            ← Torna a “Ricevuta”
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>
        {(r.email_origine_thread_id || r.email_origine_id)
          ? 'Si apre la conversazione in Gmail con la bozza copiata negli appunti. Premi Rispondi, incolla, inserisci i prezzi e invia.'
          : 'Si apre Gmail con destinatario, oggetto e bozza già pronti. Controlla, inserisci i prezzi e invia.'}
      </div>

      {/* Dati richiesta */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Richiesta</h3>
        <div style={styles.grid2}>
          <Campo label="Tipologia">
            <select value={edits.tipologia ?? r.tipologia}
                    onChange={e => cambiaCampo('tipologia', e.target.value)}
                    onBlur={() => salvaCampo('tipologia')}
                    style={styles.input}>
              {TIPOLOGIE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Canale">
            <select value={edits.canale ?? r.canale}
                    onChange={e => cambiaCampo('canale', e.target.value)}
                    onBlur={() => salvaCampo('canale')}
                    style={styles.input}>
              {CANALI.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Data arrivo">
            <input type="date" value={edits.data_arrivo ?? r.data_arrivo ?? ''}
                   onChange={e => cambiaCampo('data_arrivo', e.target.value || null)}
                   onBlur={() => salvaCampo('data_arrivo')}
                   style={styles.input} />
          </Campo>
          <Campo label="Data partenza">
            <input type="date" value={edits.data_partenza ?? r.data_partenza ?? ''}
                   onChange={e => cambiaCampo('data_partenza', e.target.value || null)}
                   onBlur={() => salvaCampo('data_partenza')}
                   style={styles.input} />
          </Campo>
          <Campo label="Periodo (se date non precise)" full>
            <input type="text" placeholder="es. ultimo weekend di aprile"
                   value={edits.periodo_note ?? r.periodo_note ?? ''}
                   onChange={e => cambiaCampo('periodo_note', e.target.value || null)}
                   onBlur={() => salvaCampo('periodo_note')}
                   style={styles.input} />
          </Campo>
          <Campo label="N. persone">
            <input type="number" min="0"
                   value={edits.n_persone ?? r.n_persone ?? ''}
                   onChange={e => cambiaCampo('n_persone', e.target.value === '' ? null : Number(e.target.value))}
                   onBlur={() => salvaCampo('n_persone')}
                   style={styles.input} />
          </Campo>
          <Campo label="N. accompagnatori">
            <input type="number" min="0"
                   value={edits.n_accompagnatori ?? r.n_accompagnatori ?? ''}
                   onChange={e => cambiaCampo('n_accompagnatori', e.target.value === '' ? null : Number(e.target.value))}
                   onBlur={() => salvaCampo('n_accompagnatori')}
                   style={styles.input} />
          </Campo>
          <Campo label="Servizi richiesti" full>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {SERVIZI.map(s => {
                const corr = edits.servizi ?? r.servizi ?? []
                const attivo = corr.includes(s.key)
                return (
                  <label key={s.key} style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={attivo}
                           onChange={() => {
                             const next = attivo ? corr.filter(x => x !== s.key) : [...corr, s.key]
                             cambiaCampo('servizi', next)
                           }}
                           onBlur={() => salvaCampo('servizi')} />{' '}
                    {s.label}
                  </label>
                )
              })}
            </div>
          </Campo>
          <Campo label="Note interne" full>
            <textarea rows={3}
                      value={edits.note ?? r.note ?? ''}
                      onChange={e => cambiaCampo('note', e.target.value || null)}
                      onBlur={() => salvaCampo('note')}
                      style={{ ...styles.input, resize: 'vertical' }} />
          </Campo>
        </div>

        {dirty && (
          <div style={{ marginTop: 10 }}>
            <button className="btn-primary" onClick={salvaTutti} disabled={busy}>Salva modifiche</button>
          </div>
        )}
      </section>

      {/* Bozza di risposta */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h3 style={{ ...styles.sezione, margin: 0 }}>Bozza di risposta</h3>
          <button className="btn-ghost" onClick={rigeneraBozza} disabled={rigenerando}
                  style={{ marginLeft: 'auto' }}>
            {rigenerando ? 'Rigenerazione…' : '↻ Rigenera bozza'}
          </button>
        </div>
        <textarea rows={10} value={bozza}
                  onChange={e => { setBozza(e.target.value); setBozzaDirty(true) }}
                  placeholder="La bozza viene generata automaticamente dalle email importate. Puoi scriverla a mano qui."
                  style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} />
        {bozzaDirty && (
          <div style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={salvaBozza} disabled={busy}>Salva bozza</button>
            <button className="btn-ghost" onClick={() => { setBozza(r.bozza_risposta || ''); setBozzaDirty(false) }}
                    style={{ marginLeft: 6 }}>
              Annulla
            </button>
          </div>
        )}
      </section>

      {/* Conversazione (messaggi del thread Gmail, in e out) */}
      {(r.email_origine_thread_id || (r.messaggi || []).length > 0) && (
        <section className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <h3 style={{ ...styles.sezione, margin: 0 }}>
              Conversazione
              {(r.messaggi || []).length > 0 && (
                <span style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400, marginLeft: 8 }}>
                  {r.n_msg_in || 0} dal cliente · {r.n_msg_out || 0} nostre
                </span>
              )}
            </h3>
            <button className="btn-ghost" onClick={aggiornaConversazione} disabled={syncing}
                    style={{ marginLeft: 'auto', fontSize: 12 }}>
              {syncing ? 'Sincronizzo…' : '↻ Aggiorna conversazione'}
            </button>
          </div>
          {(r.messaggi || []).length === 0 ? (
            <div style={{ fontSize: 13, color: '#6B6B6B' }}>
              Nessun messaggio sincronizzato ancora: premi “Aggiorna conversazione”
              oppure aspetta il giro automatico delle 06:15.
            </div>
          ) : [...r.messaggi]
              .sort((a, b) => (a.data || '').localeCompare(b.data || ''))
              .map(m => <Messaggio key={m.id} m={m} />)
          }
        </section>
      )}

      {/* Email origine: solo quando non abbiamo ancora la conversazione */}
      {r.email_origine_testo && (r.messaggi || []).length === 0 && (
        <section className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={styles.sezione}>Email originale</h3>
          <pre style={styles.pre}>{r.email_origine_testo}</pre>
        </section>
      )}

      {/* Contatto */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <h3 style={{ ...styles.sezione, margin: 0 }}>Contatto</h3>
          <Link to={`/admin/preventivi/contatti/${c.id}`}
                style={{ fontSize: 13, color: '#185FA5', textDecoration: 'none', marginLeft: 'auto' }}>
            Scheda completa →
          </Link>
        </div>
        <div style={styles.grid2}>
          <Dato label="Nome">{[c.nome, c.cognome].filter(Boolean).join(' ') || '—'}</Dato>
          <Dato label="Società/ente">{c.societa_ente || '—'}</Dato>
          <Dato label="Email">
            {c.email
              ? <a href={`mailto:${c.email}`} style={{ color: '#185FA5' }}>{c.email}</a>
              : '—'}
          </Dato>
          <Dato label="Telefono">
            {c.telefono
              ? <a href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`}
                   target="_blank" rel="noopener noreferrer" style={{ color: '#185FA5' }}>
                  💬 {c.telefono}
                </a>
              : '—'}
          </Dato>
        </div>

        {altreRichieste.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>
              Altre richieste di questo contatto:
            </div>
            {altreRichieste.map(a => (
              <Link key={a.id} to={`/admin/preventivi/richiesta/${a.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={styles.rigaCompatta}>
                  <PreventivoStatoBadge stato={a.stato} compact />
                  <span style={{ fontSize: 12.5 }}>{tipologiaLabel(a.tipologia)}</span>
                  <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                    {fmtDataRange(a.data_arrivo, a.data_partenza) || '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
                    ricevuta {fmtData(a.data_ricevuta?.slice(0, 10))}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Cambio stato */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Cambio stato</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATI.map(s => (
            <button key={s.key}
                    disabled={busy || r.stato === s.key}
                    onClick={() => proponiCambioStato(s.key)}
                    style={{
                      ...styles.statoBtn,
                      ...(r.stato === s.key
                        ? { background: s.bg, color: s.fg, borderColor: s.fg, cursor: 'default', opacity: 1 }
                        : { background: '#fff', color: '#333', borderColor: '#ccc' }),
                    }}>
              {s.label}
            </button>
          ))}
        </div>

        {r.stato === 'persa' && r.motivo_perdita && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <b>Motivo:</b> {motivoLabel(r.motivo_perdita)}
            {r.motivo_perdita_note ? ` — ${r.motivo_perdita_note}` : ''}
          </div>
        )}
        {r.stato === 'confermata' && r.krossbooking_ref && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <b>Krossbooking:</b> {r.krossbooking_ref}
          </div>
        )}
      </section>

      {/* Elimina */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Zona pericolosa</h3>
        <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 8 }}>
          Elimina definitivamente la richiesta (e il suo log). Il contatto
          resta in rubrica. Non si puo' annullare.
        </div>
        <button className="btn-danger" onClick={eliminaRichiesta} disabled={busy}>
          Elimina preventivo
        </button>
      </section>

      {/* Log eventi */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Log</h3>
        {(r.eventi || []).length === 0 && (
          <div style={{ fontSize: 13, color: '#6B6B6B' }}>Nessun evento registrato.</div>
        )}
        {[...(r.eventi || [])]
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .map(ev => (
          <div key={ev.id} style={styles.rigaCompatta}>
            <span style={{ fontSize: 12, color: '#6B6B6B', minWidth: 110 }}>
              {fmtDataOra(ev.created_at)}
            </span>
            <span style={{ fontSize: 12.5 }}>
              {ev.tipo === 'cambio_stato'
                ? `${statoDi(ev.da_stato).label} → ${statoDi(ev.a_stato).label}`
                : ev.tipo === 'ricontattato'
                ? 'Follow-up effettuato'
                : ev.tipo === 'rigenera_bozza'
                ? 'Bozza rigenerata'
                : ev.tipo === 'email_import'
                ? 'Importata da Gmail'
                : ev.tipo}
            </span>
            {ev.testo && (
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>{ev.testo}</span>
            )}
          </div>
        ))}
      </section>

      {/* Modal: persa */}
      {modalConferma?.tipo === 'persa' && (
        <ModalConferma onClose={() => setModalConferma(null)}>
          <h3 style={styles.sezione}>Perché è stata persa?</h3>
          <select value={modalConferma.motivo}
                  onChange={e => setModalConferma(m => ({ ...m, motivo: e.target.value }))}
                  style={{ ...styles.input, marginBottom: 10 }}>
            {MOTIVI_PERDITA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <textarea rows={3} placeholder="Note facoltative"
                    value={modalConferma.note}
                    onChange={e => setModalConferma(m => ({ ...m, note: e.target.value }))}
                    style={{ ...styles.input, resize: 'vertical', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={confermaPersa} disabled={busy}>Conferma</button>
            <button className="btn-ghost" onClick={() => setModalConferma(null)}>Annulla</button>
          </div>
        </ModalConferma>
      )}

      {/* Modal: krossbooking / confermata */}
      {modalConferma?.tipo === 'confermata' && (
        <ModalConferma onClose={() => setModalConferma(null)}>
          <h3 style={styles.sezione}>Numero prenotazione Krossbooking</h3>
          <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 10 }}>
            Nessuna integrazione automatica: inserisci il riferimento a mano.
          </div>
          <input type="text" placeholder="es. 123456"
                 value={modalConferma.ref}
                 onChange={e => setModalConferma(m => ({ ...m, ref: e.target.value }))}
                 style={{ ...styles.input, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={confermaKrossbooking} disabled={busy}>
              Conferma
            </button>
            <button className="btn-ghost" onClick={() => setModalConferma(null)}>Annulla</button>
          </div>
        </ModalConferma>
      )}
    </div>
  )
}

function Campo({ label, children, full = false }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}

function Dato({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  )
}

// Un messaggio della conversazione: in = cliente (grigio, a sinistra),
// out = reception (giallo chiaro, a destra). Testo lungo troncato con
// "mostra tutto".
function Messaggio({ m }) {
  const [tutto, setTutto] = useState(false)
  const out = m.direzione === 'out'
  const testo = (m.testo || m.snippet || '').trim()
  const lungo = testo.length > 600
  const mostrato = tutto || !lungo ? testo : testo.slice(0, 600) + '…'
  return (
    <div style={{
      display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '88%', padding: '10px 12px', borderRadius: 10,
        background: out ? '#FFF8E1' : '#F6F5F1',
        border: `0.5px solid ${out ? '#F5B301' : '#E5E3DC'}`,
      }}>
        <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 4 }}>
          <b style={{ color: '#333' }}>{out ? 'Reception' : (m.from_name || m.from_email || 'Cliente')}</b>
          {' · '}{fmtDataOra(m.data)}
          {m.subject && <span> · {m.subject}</span>}
        </div>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{mostrato}</div>
        {lungo && (
          <button onClick={() => setTutto(t => !t)}
                  style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 12, padding: 0, marginTop: 4, cursor: 'pointer' }}>
            {tutto ? 'mostra meno' : 'mostra tutto'}
          </button>
        )}
      </div>
    </div>
  )
}

function ModalConferma({ children, onClose }) {
  return (
    <div style={styles.modalBg} onClick={onClose}>
      <div className="card" style={styles.modal} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const styles = {
  sezione: { fontSize: 14, fontWeight: 600, color: '#111', marginTop: 0, marginBottom: 10 },
  grid2: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  input: {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
    boxSizing: 'border-box',
  },
  statoBtn: {
    padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
    border: '0.5px solid', cursor: 'pointer', fontWeight: 500,
  },
  rigaCompatta: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
    padding: '6px 0', borderTop: '0.5px solid #eee',
  },
  pre: {
    fontSize: 12, background: '#F6F5F1', padding: 10, borderRadius: 6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8,
  },
  errorBar: {
    background: '#FCEBEB', color: '#C5221F', padding: '8px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10,
  },
  okBar: {
    background: '#E6F6EF', color: '#1E8E3E', padding: '6px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10, display: 'inline-block',
  },
  promptBox: {
    padding: 12, marginBottom: 12,
    background: '#FFF8E1', border: '0.5px solid #F5B301', borderRadius: 7,
  },
  modalBg: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, padding: 16,
  },
  modal: { maxWidth: 440, width: '100%', padding: 18 },
}
