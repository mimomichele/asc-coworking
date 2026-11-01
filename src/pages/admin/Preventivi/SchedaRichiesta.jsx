// ============================================================
// Preventivi > scheda richiesta
//
// Ordine pensato per chi risponde ai preventivi, non per chi ha
// costruito l'app:
//   a) intestazione: nome, stato, riga riassuntiva in italiano
//   b) conversazione email (se arrivata via Gmail), ultimi messaggi
//   c) bozza di risposta
//   d) importo + azioni: Apri/Rispondi in Gmail, Ricontattato,
//      Confermata (chiede il numero Krossbooking), Persa (motivo),
//      Torna a Ricevuta
//   e) "Modifica dati richiesta": pannello chiuso, salvataggio esplicito
//   f) contatto e storico
//   g) log
//   h) zona pericolosa (chiusa): riapri richiesta chiusa, elimina
//
// Gli stati 'attesa' e 'scaduta' li mette solo il job quotidiano.
// Ogni cambio di stato finisce nel log via trigger DB.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  TIPOLOGIE, CANALI, SERVIZI, MOTIVI_PERDITA,
  statoDi, tipologiaLabel, serviziLabel,
  motivoLabel, fmtData, fmtDataOra, fmtDataRange,
  etichettaContatto, urlGmailCompose, urlGmailThread, suggerisciOggetto,
  PREV_EVENTO_AGGIORNAMENTO,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'
import PreventivoFaseChip from '../../../components/PreventivoFaseChip.jsx'
import ImportoMancanteBadge from '../../../components/ImportoMancanteBadge.jsx'

const SELECT_SAFE = `
  *,
  contatto:contatti!inner(*,
    altre:richieste_preventivo(id, tipologia, stato, data_arrivo, data_partenza, data_ricevuta, importo_preventivo)
  ),
  eventi:richieste_eventi(id, utente_id, tipo, da_stato, a_stato, testo, created_at),
  messaggi:richieste_messaggi(id, direzione, from_name, from_email, subject, testo, snippet, data)
`

const CAMPI_DETTAGLIO = [
  'tipologia', 'canale', 'data_arrivo', 'data_partenza', 'periodo_note',
  'n_persone', 'n_accompagnatori', 'servizi', 'note',
]

const STATI_CHIUSI = ['confermata', 'persa', 'scaduta']

// "Famiglia o singolo, 4 persone, 5-7 dic 2026, pernottamento e pasti"
function riassunto(r) {
  const parti = [tipologiaLabel(r.tipologia)]
  if (r.n_persone) {
    parti.push(`${r.n_persone} persone${r.n_accompagnatori ? ` + ${r.n_accompagnatori} accompagnatori` : ''}`)
  }
  const date = fmtDataRange(r.data_arrivo, r.data_partenza) || r.periodo_note
  if (date) parti.push(date)
  if (r.servizi?.length) parti.push(serviziLabel(r.servizi).toLowerCase())
  return parti.join(', ')
}

const EVENTO_LABEL = {
  ricontattato: 'Follow-up effettuato',
  rigenera_bozza: 'Bozza rigenerata',
  email_import: 'Importata da Gmail',
  nota: 'Nota',
  follow_up: 'Follow-up',
}

export default function SchedaRichiesta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [salva, setSalva] = useState(null)
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState({})
  const [dettagliAperti, setDettagliAperti] = useState(false)
  const [bozza, setBozza] = useState('')
  const [bozzaDirty, setBozzaDirty] = useState(false)
  const [rigenerando, setRigenerando] = useState(false)
  const [modalConferma, setModalConferma] = useState(null) // {tipo:'persa'|'confermata', ...}
  const [syncing, setSyncing] = useState(false)
  const [conversazioneTutta, setConversazioneTutta] = useState(false)
  const [importoLocal, setImportoLocal] = useState('')
  const [chiediImporto, setChiediImporto] = useState(false)
  const [pericoloAperto, setPericoloAperto] = useState(false)

  useEffect(() => { fetchRichiesta() }, [id])

  // Realtime: quando il sync Make aggiunge messaggi o aggiorna la riga,
  // la scheda si ricarica da sola.
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
    setTimeout(() => setSalva(null), 2600)
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

  // --- dettagli: modifiche in locale, salvataggio esplicito ----------
  // (niente salvataggio al blur: con le checkbox faceva perdere la
  // seconda spunta mentre la prima era ancora in volo)
  function cambiaCampo(k, v) {
    setEdits(e => ({ ...e, [k]: v }))
  }
  const dettagliDirty = Object.keys(edits).length > 0
  async function salvaDettagli() {
    if (!dettagliDirty) return
    if (edits.data_arrivo && edits.data_partenza && edits.data_partenza < edits.data_arrivo) {
      setErr('La data di partenza non può precedere l’arrivo.')
      return
    }
    const ok = await aggiorna(edits, 'Salvataggio dati')
    if (ok) setEdits({})
  }
  function annullaDettagli() { setEdits({}) }
  const val = (k) => (k in edits ? edits[k] : r?.[k])

  // --- Gmail -------------------------------------------------------
  // window.open deve avvenire in modo SINCRONO dentro il click: dopo un
  // await il browser lo blocca come popup. Lo stato passa a 'inviato'
  // solo DOPO, e solo se la finestra si e' aperta. Se manca l'importo,
  // al primo click mostriamo il prompt: sara' quel click ad aprire Gmail.
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
    const v = importoLocal === '' ? null : Number(importoLocal)
    if (v !== null && !Number.isFinite(v)) return
    const attuale = r.importo_preventivo === null || r.importo_preventivo === undefined ? null : Number(r.importo_preventivo)
    if (v === attuale) return
    await aggiorna({ importo_preventivo: v }, 'Importo')
  }

  // --- stati manuali ---------------------------------------------
  async function tornaARicevuta() {
    // operatore_invio e data_invio restano come storico.
    await aggiorna({ stato: 'ricevuta' }, 'Torna a Ricevuta')
  }

  async function ricontattato() {
    const ora = new Date().toISOString()
    const ok = await aggiorna({ data_ultimo_contatto: ora }, 'Ricontattato')
    if (ok) {
      await supabase.from('richieste_eventi').insert({
        richiesta_id: id, tipo: 'ricontattato', testo: 'Follow-up effettuato',
      })
      fetchRichiesta()
    }
  }

  async function confermaPersa() {
    const ok = await aggiorna({
      stato: 'persa',
      motivo_perdita: modalConferma.motivo,
      motivo_perdita_note: modalConferma.note?.trim() || null,
    }, 'Persa')
    if (ok) setModalConferma(null)
  }

  async function confermaKrossbooking() {
    if (!modalConferma.ref?.trim()) {
      setErr('Inserisci il numero di prenotazione Krossbooking.')
      return
    }
    const ok = await aggiorna({
      stato: 'confermata',
      krossbooking_ref: modalConferma.ref.trim(),
    }, 'Confermata')
    if (ok) setModalConferma(null)
  }

  // --- bozza -------------------------------------------------------
  async function rigeneraBozza() {
    setRigenerando(true); setErr('')
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    if (!token) { setRigenerando(false); setErr('Sessione scaduta.'); return }
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preventivi-rigenera-bozza`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  // --- conversazione ------------------------------------------------
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

  // --- zona pericolosa ---------------------------------------------
  async function eliminaRichiesta() {
    const ok = window.confirm(
      'Eliminare definitivamente questa richiesta?\nL’operazione non si può annullare.'
    )
    if (!ok) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('richieste_preventivo').delete().eq('id', id)
    setBusy(false)
    if (error) { setErr(`Eliminazione: ${error.message}`); return }
    window.dispatchEvent(new Event(PREV_EVENTO_AGGIORNAMENTO))
    navigate('/admin/preventivi')
  }

  const altreRichieste = useMemo(() => {
    if (!r?.contatto?.altre) return []
    return r.contatto.altre
      .filter(a => a.id !== r.id)
      .sort((a, b) => (b.data_ricevuta || '').localeCompare(a.data_ricevuta || ''))
  }, [r])

  const messaggiOrdinati = useMemo(() => {
    return [...(r?.messaggi || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
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
  const haThread = !!(r.email_origine_thread_id || r.email_origine_id)
  const chiusa = STATI_CHIUSI.includes(r.stato)
  const nascosti = conversazioneTutta ? [] : messaggiOrdinati.slice(0, Math.max(0, messaggiOrdinati.length - 2))
  const visibili = conversazioneTutta ? messaggiOrdinati : messaggiOrdinati.slice(-2)

  return (
    <div>
      {/* a) Intestazione */}
      <div style={{ marginBottom: 14 }}>
        <Link to="/admin/preventivi" style={{ fontSize: 13, color: '#6B6B6B', textDecoration: 'none' }}>
          ← Preventivi
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{etichettaContatto(c)}</h2>
          <PreventivoStatoBadge stato={r.stato} />
          <PreventivoFaseChip richiesta={r} />
          <ImportoMancanteBadge richiesta={r} />
        </div>
        <div style={{ fontSize: 14.5, color: '#333', marginTop: 6 }}>{riassunto(r)}</div>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
          Ricevuta il {fmtDataOra(r.data_ricevuta)}
          {r.data_invio ? ` · inviata il ${fmtDataOra(r.data_invio)}` : ''}
          {r.data_chiusura ? ` · chiusa il ${fmtDataOra(r.data_chiusura)}` : ''}
          {r.stato === 'confermata' && r.krossbooking_ref ? ` · Krossbooking ${r.krossbooking_ref}` : ''}
          {r.stato === 'persa' && r.motivo_perdita
            ? ` · motivo: ${motivoLabel(r.motivo_perdita)}${r.motivo_perdita_note ? ` (${r.motivo_perdita_note})` : ''}`
            : ''}
        </div>
      </div>

      {err && <div style={styles.errorBar}>{err}</div>}
      {salva && <div style={styles.okBar}>{salva}</div>}

      {/* b) Conversazione email */}
      {(haThread || messaggiOrdinati.length > 0) && (
        <section className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <h3 style={{ ...styles.sezione, margin: 0 }}>
              Conversazione
              {messaggiOrdinati.length > 0 && (
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
          {messaggiOrdinati.length === 0 ? (
            r.email_origine_testo
              ? <pre style={styles.pre}>{r.email_origine_testo}</pre>
              : <div style={{ fontSize: 13, color: '#6B6B6B' }}>
                  Nessun messaggio ancora: premi “Aggiorna conversazione” o aspetta il giro delle 06:15.
                </div>
          ) : (
            <>
              {nascosti.length > 0 && (
                <button onClick={() => setConversazioneTutta(true)}
                        style={styles.linkBtn}>
                  Mostra {nascosti.length === 1 ? 'il messaggio precedente' : `i ${nascosti.length} messaggi precedenti`}
                </button>
              )}
              {visibili.map(m => <Messaggio key={m.id} m={m} />)}
              {conversazioneTutta && messaggiOrdinati.length > 2 && (
                <button onClick={() => setConversazioneTutta(false)} style={styles.linkBtn}>
                  Mostra solo gli ultimi
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* c) Bozza di risposta */}
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
                  placeholder="Nessuna bozza ancora. Clicca Rigenera bozza per prepararla dai dati della richiesta, oppure scrivila qui."
                  style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} />
        {bozzaDirty && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button className="btn-primary" onClick={salvaBozza} disabled={busy}>Salva bozza</button>
            <button className="btn-ghost" onClick={() => { setBozza(r.bozza_risposta || ''); setBozzaDirty(false) }}>
              Annulla
            </button>
          </div>
        )}
      </section>

      {/* d) Importo + azioni */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12.5, color: '#6B6B6B' }}>Importo preventivo (€)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="es. 1250"
                 value={importoLocal}
                 onChange={e => setImportoLocal(e.target.value)}
                 onBlur={salvaImporto}
                 style={{ ...styles.input, width: 140 }} />
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <button className="btn-primary" onClick={() => apriInGmail()}
                  disabled={busy || (!c.email && !haThread)}>
            {haThread ? '✉ Rispondi in Gmail' : '✉ Apri in Gmail'}
          </button>
          <button className="btn-ghost" onClick={ricontattato} disabled={busy}>
            Ricontattato
          </button>
          {r.stato !== 'confermata' && (
            <button className="btn-ghost"
                    onClick={() => setModalConferma({ tipo: 'confermata', ref: r.krossbooking_ref || '' })}
                    disabled={busy}>
              ✓ Confermata
            </button>
          )}
          {r.stato !== 'persa' && (
            <button className="btn-ghost"
                    onClick={() => setModalConferma({ tipo: 'persa', motivo: 'nessuna_risposta', note: '' })}
                    disabled={busy}>
              Persa
            </button>
          )}
          {(r.stato === 'inviato' || r.stato === 'attesa') && (
            <button className="btn-ghost" onClick={tornaARicevuta} disabled={busy}>
              ← Torna a Ricevuta
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6B6B6B' }}>
          {haThread
            ? 'Si apre la conversazione in Gmail con la bozza copiata negli appunti. Premi Rispondi, incolla, inserisci i prezzi e invia.'
            : 'Si apre Gmail con destinatario, oggetto e bozza già pronti. Controlla, inserisci i prezzi e invia.'}
        </div>
      </section>

      {/* e) Dettagli modificabili (pannello chiuso) */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <button onClick={() => setDettagliAperti(a => !a)} style={styles.toggleRow}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Modifica dati richiesta</span>
          <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
            {dettagliAperti ? 'chiudi ▴' : 'apri ▾'}
          </span>
        </button>

        {dettagliAperti && (
          <div style={{ marginTop: 12 }}>
            <div style={styles.grid2}>
              <Campo label="Tipologia">
                <select value={val('tipologia')} onChange={e => cambiaCampo('tipologia', e.target.value)} style={styles.input}>
                  {TIPOLOGIE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </Campo>
              <Campo label="Canale">
                <select value={val('canale')} onChange={e => cambiaCampo('canale', e.target.value)} style={styles.input}>
                  {CANALI.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </Campo>
              <Campo label="Data arrivo">
                <input type="date" value={val('data_arrivo') ?? ''}
                       onChange={e => cambiaCampo('data_arrivo', e.target.value || null)} style={styles.input} />
              </Campo>
              <Campo label="Data partenza">
                <input type="date" value={val('data_partenza') ?? ''}
                       onChange={e => cambiaCampo('data_partenza', e.target.value || null)} style={styles.input} />
              </Campo>
              <Campo label="Periodo (se date non precise)" full>
                <input type="text" placeholder="es. ultimo weekend di aprile"
                       value={val('periodo_note') ?? ''}
                       onChange={e => cambiaCampo('periodo_note', e.target.value || null)} style={styles.input} />
              </Campo>
              <Campo label="N. persone">
                <input type="number" min="0" value={val('n_persone') ?? ''}
                       onChange={e => cambiaCampo('n_persone', e.target.value === '' ? null : Number(e.target.value))}
                       style={styles.input} />
              </Campo>
              <Campo label="N. accompagnatori">
                <input type="number" min="0" value={val('n_accompagnatori') ?? ''}
                       onChange={e => cambiaCampo('n_accompagnatori', e.target.value === '' ? null : Number(e.target.value))}
                       style={styles.input} />
              </Campo>
              <Campo label="Servizi richiesti" full>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {SERVIZI.map(s => {
                    const corr = val('servizi') || []
                    const attivo = corr.includes(s.key)
                    return (
                      <label key={s.key} style={{ fontSize: 13 }}>
                        <input type="checkbox" checked={attivo}
                               onChange={() => cambiaCampo('servizi',
                                 attivo ? corr.filter(x => x !== s.key) : [...corr, s.key])} />{' '}
                        {s.label}
                      </label>
                    )
                  })}
                </div>
              </Campo>
              <Campo label="Note interne" full>
                <textarea rows={3} value={val('note') ?? ''}
                          onChange={e => cambiaCampo('note', e.target.value || null)}
                          style={{ ...styles.input, resize: 'vertical' }} />
              </Campo>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button className="btn-primary" onClick={salvaDettagli} disabled={busy || !dettagliDirty}>
                Salva modifiche
              </button>
              {dettagliDirty && (
                <button className="btn-ghost" onClick={annullaDettagli}>Annulla</button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* f) Contatto */}
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
            {c.email ? <a href={`mailto:${c.email}`} style={{ color: '#185FA5' }}>{c.email}</a> : '—'}
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

      {/* g) Log */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Log</h3>
        {(r.eventi || []).length === 0 && (
          <div style={{ fontSize: 13, color: '#6B6B6B' }}>Nessun evento registrato.</div>
        )}
        {[...(r.eventi || [])]
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .map(ev => (
          <div key={ev.id} style={styles.rigaCompatta}>
            <span style={{ fontSize: 12, color: '#6B6B6B', minWidth: 110 }}>{fmtDataOra(ev.created_at)}</span>
            <span style={{ fontSize: 12.5 }}>
              {ev.tipo === 'cambio_stato'
                ? `${statoDi(ev.da_stato).label} → ${statoDi(ev.a_stato).label}`
                : (EVENTO_LABEL[ev.tipo] || ev.tipo)}
            </span>
            {ev.testo && ev.tipo !== 'ricontattato' && ev.tipo !== 'rigenera_bozza' && (
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>{ev.testo}</span>
            )}
          </div>
        ))}
      </section>

      {/* h) Zona pericolosa (chiusa) */}
      <section className="card" style={{ padding: 16, marginBottom: 16, borderColor: '#F09595' }}>
        <button onClick={() => setPericoloAperto(a => !a)} style={styles.toggleRow}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#C5221F' }}>Zona pericolosa</span>
          <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
            {pericoloAperto ? 'chiudi ▴' : 'apri ▾'}
          </span>
        </button>
        {pericoloAperto && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chiusa && (
              <div>
                <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 6 }}>
                  Richiesta chiusa come “{statoDi(r.stato).label}”. Se è stato un errore, riaprila: torna a Ricevuta.
                </div>
                <button className="btn-ghost" onClick={tornaARicevuta} disabled={busy}>Riapri richiesta</button>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 6 }}>
                Elimina definitivamente la richiesta (e il suo log). Il contatto resta in rubrica. Non si può annullare.
              </div>
              <button className="btn-danger" onClick={eliminaRichiesta} disabled={busy}>Elimina preventivo</button>
            </div>
          </div>
        )}
      </section>

      {/* Modal: persa */}
      {modalConferma?.tipo === 'persa' && (
        <ModalConferma onClose={() => setModalConferma(null)}>
          <h3 style={styles.sezione}>Segna come persa</h3>
          <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 8 }}>Il motivo è obbligatorio.</div>
          <select value={modalConferma.motivo}
                  onChange={e => setModalConferma(m => ({ ...m, motivo: e.target.value }))}
                  style={{ ...styles.input, marginBottom: 10 }}>
            {MOTIVI_PERDITA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <textarea rows={3} placeholder="Nota facoltativa"
                    value={modalConferma.note}
                    onChange={e => setModalConferma(m => ({ ...m, note: e.target.value }))}
                    style={{ ...styles.input, resize: 'vertical', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={confermaPersa} disabled={busy}>Conferma</button>
            <button className="btn-ghost" onClick={() => setModalConferma(null)}>Annulla</button>
          </div>
        </ModalConferma>
      )}

      {/* Modal: confermata (numero Krossbooking) */}
      {modalConferma?.tipo === 'confermata' && (
        <ModalConferma onClose={() => setModalConferma(null)}>
          <h3 style={styles.sezione}>Segna come confermata</h3>
          <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 8 }}>
            Inserisci il numero della prenotazione fatta su Krossbooking (nessun collegamento automatico).
          </div>
          <input type="text" placeholder="es. 123456" autoFocus
                 value={modalConferma.ref}
                 onChange={e => setModalConferma(m => ({ ...m, ref: e.target.value }))}
                 onKeyDown={e => { if (e.key === 'Enter') confermaKrossbooking() }}
                 style={{ ...styles.input, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={confermaKrossbooking} disabled={busy}>Conferma</button>
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
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
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
          <button onClick={() => setTutto(t => !t)} style={styles.linkBtn}>
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
  toggleRow: {
    display: 'flex', alignItems: 'center', width: '100%',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#185FA5', fontSize: 12,
    padding: 0, marginTop: 4, marginBottom: 6, cursor: 'pointer',
  },
  rigaCompatta: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
    padding: '6px 0', borderTop: '0.5px solid #eee',
  },
  pre: {
    fontSize: 12, background: '#F6F5F1', padding: 10, borderRadius: 6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8,
  },
  promptBox: {
    padding: 12, marginBottom: 12,
    background: '#FFF8E1', border: '0.5px solid #F5B301', borderRadius: 7,
  },
  errorBar: {
    background: '#FCEBEB', color: '#C5221F', padding: '8px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10,
  },
  okBar: {
    background: '#E6F6EF', color: '#1E8E3E', padding: '6px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10, display: 'inline-block',
  },
  modalBg: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, padding: 16,
  },
  modal: { maxWidth: 440, width: '100%', padding: 18 },
}
