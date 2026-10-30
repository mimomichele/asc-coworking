// ============================================================
// Preventivi > Oggi
//
// Tre blocchi:
//   1. Nuove da gestire (stato = ricevuta)
//   2. Da ricontattare (inviato/attesa oltre la soglia follow-up
//      della tipologia; soglie da preventivi_impostazioni)
//   3. Inviate oggi (data_invio = oggi, timezone Europe/Rome)
//
// Il conteggio totale (nuove + ricontattare) e' esposto come
// variabile globale leggibile da AdminLayout (badge rosso).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  fmtDataRange, fmtData, fmtDataOra, etichettaContatto,
  tipologiaLabel, faseConversazione, PREV_EVENTO_AGGIORNAMENTO,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'
import PreventivoFaseChip from '../../../components/PreventivoFaseChip.jsx'
import ImportoMancanteBadge from '../../../components/ImportoMancanteBadge.jsx'

// Giorni passati tra ISO e now().
function giorniDa(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Data "oggi" come YYYY-MM-DD in Europe/Rome.
function oggiRoma() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const SELECT_RICHIESTA = `
  id, tipologia, canale, data_arrivo, data_partenza, periodo_note,
  n_persone, stato, importo_preventivo, data_invio, data_ultimo_contatto,
  data_ricevuta, created_at,
  ultimo_msg_direzione, ultimo_msg_at, n_msg_in, n_msg_out,
  contatto:contatti!inner(id, nome, cognome, societa_ente, email, telefono)
`

export default function PreventiviOggi() {
  const [data, setData] = useState({ nuove: [], risposte: [], ricontattare: [], inviateOggi: [], soglie: null })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  // Riquadro "Come funziona": chiuso resta chiuso (localStorage), il "?"
  // in alto a destra lo riapre.
  const [guidaAperta, setGuidaAperta] = useState(() => {
    try { return localStorage.getItem('preventivi_guida_chiusa') !== '1' } catch { return true }
  })
  function chiudiGuida() {
    setGuidaAperta(false)
    try { localStorage.setItem('preventivi_guida_chiusa', '1') } catch { /* ignora */ }
  }
  function apriGuida() {
    setGuidaAperta(true)
    try { localStorage.removeItem('preventivi_guida_chiusa') } catch { /* ignora */ }
  }

  useEffect(() => { fetchAll() }, [])

  // Realtime: appena una riga viene INSERT o UPDATE in richieste_preventivo,
  // rifetch della lista. Niente polling, niente "quando aggiorno?":
  // la pagina si aggiorna da sola mentre Make/edge function importa.
  useEffect(() => {
    const channel = supabase
      .channel('preventivi-oggi-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'richieste_preventivo' },
        () => { fetchAll() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchAll() {
    setErr('')
    const oggi = oggiRoma()

    const [sogliaRes, nuoveRes, pendentiRes, inviateRes] = await Promise.all([
      supabase.from('preventivi_impostazioni')
        .select('value').eq('key', 'follow_up_giorni').maybeSingle(),
      supabase.from('richieste_preventivo')
        .select(SELECT_RICHIESTA).eq('stato', 'ricevuta')
        .order('data_ricevuta', { ascending: true }),
      supabase.from('richieste_preventivo')
        .select(SELECT_RICHIESTA).in('stato', ['inviato', 'attesa'])
        .order('data_invio', { ascending: true }),
      // "Inviate oggi e ieri": prendo quelle con data_invio nelle ultime
      // 72h (inviato o gia' passate in attesa dal cron) e filtro in JS per
      // calendar date Europe/Rome. Evita scherzi di DST (il range in SQL
      // non puo' usare "Europe/Rome").
      supabase.from('richieste_preventivo')
        .select(SELECT_RICHIESTA).in('stato', ['inviato', 'attesa'])
        .gte('data_invio', new Date(Date.now() - 72 * 3600 * 1000).toISOString()),
    ])

    if (nuoveRes.error) {
      setErr(nuoveRes.error.code === '42P01'
        ? 'Le tabelle Preventivi non esistono: applica la migrazione 20261030120000_preventivi.sql.'
        : 'Non riesco a caricare le richieste. Riprova.')
      setLoading(false)
      return
    }

    const soglie = sogliaRes.data?.value || { raduno: 7, scuola: 14, famiglia: 3 }

    // "Risposte dei clienti": il cliente ha scritto dopo la nostra ultima
    // risposta e non c'e' stato un contatto successivo. Hanno priorita'
    // sul follow-up: una risposta da leggere non e' "da ricontattare".
    const risposte = (pendentiRes.data || [])
      .filter(r => faseConversazione(r)?.key === 'da_rispondere')
    const idsRisposte = new Set(risposte.map(r => r.id))

    const ricontattare = (pendentiRes.data || []).filter(r => {
      if (idsRisposte.has(r.id)) return false
      const rif = r.data_ultimo_contatto || r.data_invio
      const gg = giorniDa(rif)
      if (gg === null) return false
      const soglia = soglie[r.tipologia] ?? soglie.famiglia ?? 3
      return gg >= soglia
    })

    // Filtro "oggi"/"ieri" sulla data del fuso Europe/Rome.
    const giornoDi = (iso) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso))
    const ieri = giornoDi(new Date(Date.now() - 24 * 3600 * 1000))
    const inviateOggi = (inviateRes.data || [])
      .filter(r => r.data_invio && [oggi, ieri].includes(giornoDi(r.data_invio)))
      .sort((a, b) => (b.data_invio || '').localeCompare(a.data_invio || ''))

    setData({
      nuove: nuoveRes.data || [],
      risposte,
      ricontattare,
      inviateOggi,
      soglie,
    })
    setLoading(false)
  }

  // Pubblica il conteggio per il badge in topbar: AdminLayout fa
  // polling, questo evento serve per aggiornarlo subito dopo un'azione.
  useEffect(() => {
    if (loading) return
    const tot = data.nuove.length + data.ricontattare.length
    window.__preventiviNuovi = tot
    window.dispatchEvent(new Event(PREV_EVENTO_AGGIORNAMENTO))
  }, [data, loading])

  // --- Bottone "Controlla Gmail adesso" -----------------------
  // Chiama la Edge Function preventivi-importa-ora, che a sua volta
  // fa partire lo scenario Make. Le righe arrivano in DB dopo pochi
  // secondi (ciclo Gmail -> HTTP -> edge function -> insert).
  async function contaDaEmail() {
    const { count } = await supabase
      .from('richieste_preventivo')
      .select('id', { count: 'exact', head: true })
      .eq('canale', 'email')
    return count || 0
  }

  async function importaOra() {
    setImporting(true); setImportMsg(''); setErr('')
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) { setImporting(false); setErr('Sessione scaduta.'); return }
    try {
      const prima = await contaDaEmail()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preventivi-importa-ora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(payload?.error || `HTTP ${resp.status}`)
      // Se Make ha aspettato la fine dello scenario possiamo contare subito;
      // altrimenti diamo 25 secondi al giro Gmail -> AI -> database.
      if (!payload.finished) {
        setImportMsg('Importazione in corso…')
        await new Promise(res => setTimeout(res, 25000))
      }
      const dopo = await contaDaEmail()
      const n = Math.max(0, dopo - prima)
      setImportMsg(n > 0
        ? `Importate ${n} richiest${n === 1 ? 'a' : 'e'}`
        : 'Nessuna email nuova con etichetta Preventivo')
      fetchAll()
      setTimeout(() => setImportMsg(''), 20000)
    } catch (e) {
      setErr(`Importa: ${e.message}`)
    } finally {
      setImporting(false)
    }
  }

  const importoSospeso = useMemo(() => {
    return [...data.inviateOggi]  // non il totale globale, solo oggi
      .reduce((s, r) => s + Number(r.importo_preventivo || 0), 0)
  }, [data.inviateOggi])

  if (loading) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>
  if (err) return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>{err}</div>
      <button className="btn-ghost" onClick={fetchAll}>Riprova</button>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Preventivi</h2>
        <button onClick={apriGuida} title="Come funziona" aria-label="Come funziona"
                style={{
                  marginLeft: 'auto', width: 28, height: 28, borderRadius: 999,
                  border: '0.5px solid #ccc', background: '#fff', color: '#6B6B6B',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
          ?
        </button>
      </div>

      {guidaAperta && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: '#FFF8E1', borderColor: '#F5B301' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>Come funziona</b>
            <button onClick={chiudiGuida}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6B6B6B', fontSize: 12, cursor: 'pointer' }}>
              chiudi ✕
            </button>
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.55 }}>
            <li>Email di preventivo su info@: applica l’etichetta <b>Preventivo</b> in Gmail e clicca <b>Importa</b>. Richiesta al telefono o di persona: usa <b>+ Nuova</b>.</li>
            <li>La richiesta compare in <b>Nuove da gestire</b>.</li>
            <li>Apri la scheda, controlla la bozza, clicca <b>Apri in Gmail</b>, inserisci i prezzi e invia.</li>
            <li>Quando il cliente prenota su Krossbooking, clicca <b>Confermata</b>; se rinuncia, <b>Persa</b>.</li>
          </ol>
        </div>
      )}

      {/* Importa: forza il ciclo Make -> edge function -> DB.
          L'importazione automatica da Gmail avviene ogni mattina alle 06:00. */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={importaOra} disabled={importing}>
          {importing ? 'Importazione in corso…' : '↓ Importa email etichettate Preventivo'}
        </button>
        {importMsg && (
          <span style={{ fontSize: 12.5, color: '#1E8E3E' }}>{importMsg}</span>
        )}
      </div>

      <Blocco
        titolo="Nuove da gestire"
        descrizione="Richieste appena arrivate, in stato Ricevuta."
        richieste={data.nuove}
        colore="#854F0B"
        vuoto="Nessuna nuova richiesta."
      />

      <Blocco
        titolo="Risposte dei clienti"
        descrizione="Il cliente ha risposto al preventivo: da leggere e rispondere."
        richieste={data.risposte}
        colore="#C5221F"
        vuoto="Nessuna risposta in attesa."
      />

      <Blocco
        titolo="Da ricontattare"
        descrizione="Inviate o in attesa oltre la soglia follow-up."
        richieste={data.ricontattare}
        colore="#185FA5"
        vuoto="Nessuna richiesta in follow-up oggi."
      />

      <Blocco
        titolo="Inviate oggi e ieri"
        descrizione={importoSospeso > 0
          ? `Totale importi inviati oggi e ieri: ${importoSospeso.toLocaleString('it-IT', { style:'currency', currency:'EUR' })}`
          : 'Preventivi inviati dal team nelle ultime due giornate.'}
        richieste={data.inviateOggi}
        colore="#1E8E3E"
        vuoto="Nessun preventivo inviato oggi o ieri."
        mostraInvio
      />
    </div>
  )
}

function Blocco({ titolo, descrizione, richieste, colore, vuoto, mostraInvio = false }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: colore, margin: 0 }}>{titolo}</h3>
        <span style={{ fontSize: 13, color: '#6B6B6B' }}>{richieste.length}</span>
      </div>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10 }}>{descrizione}</div>

      {richieste.length === 0 ? (
        <div className="card" style={{ padding: 14, fontSize: 13, color: '#6B6B6B' }}>{vuoto}</div>
      ) : richieste.map(r => (
        <RigaRichiesta key={r.id} r={r} mostraInvio={mostraInvio} />
      ))}
    </section>
  )
}

function RigaRichiesta({ r, mostraInvio = false }) {
  return (
    <Link to={`/admin/preventivi/richiesta/${r.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ padding: 14, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {etichettaContatto(r.contatto)}
          </span>
          <PreventivoStatoBadge stato={r.stato} compact />
          <PreventivoFaseChip richiesta={r} compact />
          <ImportoMancanteBadge richiesta={r} compact />
          <span style={{ fontSize: 12, color: '#6B6B6B' }}>{tipologiaLabel(r.tipologia)}</span>
          <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
            {mostraInvio && r.data_invio
              ? `inviata ${fmtDataOra(r.data_invio)}`
              : `arrivata ${fmtData(r.data_ricevuta?.slice(0, 10)) || '—'}`}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#333' }}>
          {fmtDataRange(r.data_arrivo, r.data_partenza) || r.periodo_note || 'Date da definire'}
          {r.n_persone ? ` · ${r.n_persone} persone` : ''}
        </div>
      </div>
    </Link>
  )
}
