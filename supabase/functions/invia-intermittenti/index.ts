// ============================================================
// Edge Function: invia-intermittenti
// Invia al Ministero del Lavoro la comunicazione (o l'annullamento)
// delle giornate dei lavoratori intermittenti: email con allegato
// XML del modello ML-15-01. Parte SOLO su click di conferma di un
// admin (ruolo 'admin' in profiles), mai in automatico.
//
// Body:
//   { tipo: 'comunicazione', righe: [{ dipendente_id, inizio, fine }] }
//   { tipo: 'annullamento',  ids:   [uuid di intermittenti_annullamenti] }
//
// Non si fida del browser: ricalcola dal DB i turni coinvolti, i
// codici del lavoratore e l'XML (stessa libreria del client,
// ../_shared/intermittenti.js). Scrive sempre una riga nel registro
// intermittenti_invii; aggiorna i turni/annullamenti solo se l'email
// e' partita. Se l'SMTP fallisce: registro con esito 'errore', turni
// invariati, errore restituito all'admin.
//
// Segreti (Dashboard Supabase -> Edge Functions -> Secrets, oppure
// `npx supabase secrets set NOME=valore`):
//   SMTP_HOST, SMTP_PORT (465 = TLS diretto, 587 = STARTTLS),
//   SMTP_USER, SMTP_PASS
//   INTERMITTENTI_PROVA = 1  -> modalita' di prova: l'email va SOLO a
//                              amministrazione@aschotel.com, non al Ministero
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sono
// iniettate da Supabase.
//
// Deploy: npx supabase functions deploy invia-intermittenti
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { COSTANTI, generaXml, addGiorni, normalizzaCodice } from '../_shared/intermittenti.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type RigaXml = { codice_fiscale: string; codice_comunicazione: string; inizio: string; fine: string }
type RigaRegistro = RigaXml & { dipendente_id: string | null; nome: string; shift_ids?: string[]; annullamento_id?: string }

function giorniTra(a: string, b: string): string[] {
  const out: string[] = []
  let cur = a
  while (cur <= b) { out.push(cur); cur = addGiorni(cur, 1) }
  return out
}

async function inviaEmail(xml: string, prova: boolean): Promise<string> {
  const hostname = Deno.env.get('SMTP_HOST')
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USER')
  const password = Deno.env.get('SMTP_PASS')
  if (!hostname || !username || !password) {
    throw new Error('SMTP non configurato: impostare SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS nei secret della funzione')
  }
  const destinatario = prova ? COSTANTI.email : COSTANTI.destinatario
  const client = new SMTPClient({
    connection: { hostname, port, tls: port === 465, auth: { username, password } },
  })
  try {
    await client.send({
      from: COSTANTI.email,
      to: destinatario,
      bcc: prova ? undefined : COSTANTI.email,
      subject: COSTANTI.oggetto,
      content: COSTANTI.corpo,
      attachments: [{ filename: COSTANTI.nomeAllegato, content: xml, contentType: 'application/xml', encoding: 'text' }],
    })
  } finally {
    await client.close().catch(() => {})
  }
  return destinatario
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
    const PROVA        = Deno.env.get('INTERMITTENTI_PROVA') === '1'

    // --- 1. Chiamante: sessione valida + ruolo admin ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Autenticazione mancante' })
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessione non valida' })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return json({ error: 'Permesso negato: operazione riservata agli admin' })

    // --- 2. Body ---
    const body = await req.json().catch(() => ({}))
    const tipo = body?.tipo
    if (tipo !== 'comunicazione' && tipo !== 'annullamento') return json({ error: 'Tipo non valido' })

    const righe: RigaRegistro[] = []

    if (tipo === 'comunicazione') {
      const richieste = Array.isArray(body.righe) ? body.righe : []
      if (richieste.length === 0) return json({ error: 'Nessuna riga da comunicare' })
      if (richieste.length > COSTANTI.maxRighe) return json({ error: `Massimo ${COSTANTI.maxRighe} righe per comunicazione` })

      for (const r of richieste) {
        const { dipendente_id, inizio, fine } = r || {}
        if (!dipendente_id || !inizio || !fine || fine < inizio) return json({ error: 'Riga non valida' })
        const { data: dip } = await admin.from('dipendenti')
          .select('id,nome,cognome,a_chiamata,codice_fiscale,codice_comunicazione').eq('id', dipendente_id).single()
        if (!dip) return json({ error: 'Lavoratore non trovato' })
        if (!dip.a_chiamata) return json({ error: `${dip.nome} non è un lavoratore a chiamata` })
        if (!dip.codice_fiscale || !dip.codice_comunicazione) return json({ error: `Mancano i codici di ${dip.nome} ${dip.cognome || ''}` })

        // Tutti i giorni della riga devono avere un turno da comunicare:
        // se qualcosa e' cambiato nel frattempo, meglio fermarsi.
        const { data: turni, error: tErr } = await admin.from('shifts')
          .select('id,data').eq('dipendente_id', dipendente_id).eq('com_stato', 'da_comunicare')
          .gte('data', inizio).lte('data', fine)
        if (tErr) return json({ error: 'Errore lettura turni: ' + tErr.message })
        const giorniCoperti = new Set((turni || []).map(t => t.data))
        const attesi = giorniTra(inizio, fine)
        if (attesi.some(g => !giorniCoperti.has(g))) {
          return json({ error: `I turni di ${dip.nome} ${dip.cognome || ''} dal ${inizio} al ${fine} sono cambiati: ricarica la pagina e riprova` })
        }
        righe.push({
          dipendente_id: dip.id,
          nome: [dip.nome, dip.cognome].filter(Boolean).join(' '),
          codice_fiscale: normalizzaCodice(dip.codice_fiscale),
          codice_comunicazione: normalizzaCodice(dip.codice_comunicazione),
          inizio, fine,
          shift_ids: (turni || []).map(t => t.id),
        })
      }
    } else {
      const ids: string[] = Array.isArray(body.ids) ? body.ids : []
      if (ids.length === 0) return json({ error: 'Nessun annullamento da inviare' })
      if (ids.length > COSTANTI.maxRighe) return json({ error: `Massimo ${COSTANTI.maxRighe} righe per annullamento` })
      const { data: ann, error: aErr } = await admin.from('intermittenti_annullamenti')
        .select('*').in('id', ids).eq('stato', 'da_inviare')
      if (aErr) return json({ error: 'Errore lettura annullamenti: ' + aErr.message })
      if (!ann || ann.length !== ids.length) return json({ error: 'Alcuni annullamenti non sono più da inviare: ricarica la pagina' })
      for (const a of ann) {
        righe.push({
          dipendente_id: a.dipendente_id, nome: a.nome || '',
          codice_fiscale: normalizzaCodice(a.codice_fiscale), codice_comunicazione: normalizzaCodice(a.codice_comunicazione),
          inizio: a.inizio, fine: a.fine, annullamento_id: a.id,
        })
      }
    }

    // --- 3. XML ---
    let xml: string
    try {
      xml = generaXml({ annullamento: tipo === 'annullamento', righe })
    } catch (e) {
      return json({ error: (e as Error).message })
    }

    // --- 4. Invio email + registro ---
    const righeRegistro = righe.map(r => ({
      dipendente_id: r.dipendente_id, nome: r.nome, codice_fiscale: r.codice_fiscale,
      inizio: r.inizio, fine: r.fine,
    }))
    let destinatario = PROVA ? COSTANTI.email : COSTANTI.destinatario
    try {
      destinatario = await inviaEmail(xml, PROVA)
    } catch (e) {
      const errore = (e as Error).message || String(e)
      console.error('invia-intermittenti: SMTP fallito', errore)
      await admin.from('intermittenti_invii').insert({
        admin_id: user.id, admin_email: user.email, tipo, righe: righeRegistro, xml,
        destinatario, prova: PROVA, esito: 'errore', errore,
      })
      return json({ error: 'Invio fallito: ' + errore })
    }

    const { data: invio, error: iErr } = await admin.from('intermittenti_invii').insert({
      admin_id: user.id, admin_email: user.email, tipo, righe: righeRegistro, xml,
      destinatario, prova: PROVA, esito: 'inviato',
    }).select('id').single()
    if (iErr) console.error('invia-intermittenti: registro non scritto', iErr.message)
    const invioId = invio?.id ?? null

    // --- 5. Aggiorna gli stati ---
    if (tipo === 'comunicazione') {
      for (const r of righe) {
        await admin.from('shifts')
          .update({ com_stato: 'comunicato', com_inizio: r.inizio, com_fine: r.fine, com_invio_id: invioId })
          .in('id', r.shift_ids || [])
      }
    } else {
      await admin.from('intermittenti_annullamenti')
        .update({ stato: 'inviato', invio_id: invioId, inviato_at: new Date().toISOString() })
        .in('id', righe.map(r => r.annullamento_id))
    }

    return json({ ok: true, invio_id: invioId, destinatario, prova: PROVA, righe: righe.length })
  } catch (e) {
    console.error('invia-intermittenti: errore', e)
    return json({ error: 'Errore interno: ' + ((e as Error).message || String(e)) })
  }
})
