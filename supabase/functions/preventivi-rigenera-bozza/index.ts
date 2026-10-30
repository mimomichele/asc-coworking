// ============================================================
// Edge Function: preventivi-rigenera-bozza
//
// Rigenera la bozza di risposta di una richiesta esistente.
// Riusa il template corrente della tipologia + l'email originale
// (se c'e') + i campi che la reception potrebbe aver corretto a
// mano nel frattempo (date, n_persone, servizi, note).
//
// Chiamato dalla scheda richiesta col pulsante "Rigenera bozza".
// Richiede autenticazione admin.
//
// Secret: ANTHROPIC_API_KEY
// verify_jwt = true  (chiamato da utente loggato)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL_BOZZA = Deno.env.get('AI_MODEL_BOZZA') ?? 'claude-sonnet-5-5'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function systemBozza(template: {
  oggetto_template: string
  corpo_template: string
}): string {
  return `Sei la reception di ASC Hotel. Scrivi la BOZZA della risposta al cliente usando il template fornito, personalizzando saluto, riferimento alle date/al gruppo/ai servizi richiesti e tono.

REGOLE RIGIDE:
- Mantieni TUTTI i segnaposto fra parentesi quadre che iniziano con [PREZZO ...] (es. [PREZZO notte], [PREZZO pasto], [PREZZO piscina]). Non sostituirli con numeri. Mai inventare prezzi.
- Altri segnaposto ([NOME], [COGNOME], [DATE], [N_PERSONE], [N_ACCOMPAGNATORI], [SERVIZI], [NOME_GRUPPO], [VALIDITA]) vanno sostituiti coi dati; se un dato manca, lascia il segnaposto cosi' com'e'.
- Firma con "Reception ASC Hotel".
- Nessuna emoji. Italiano formale ma caldo.
- Rispondi SOLO con il corpo dell'email (testo semplice, niente markdown, niente code fence). Non includere l'oggetto.

TEMPLATE (oggetto a titolo di riferimento, non ripeterlo nel corpo):
Oggetto: ${template.oggetto_template}

Corpo:
${template.corpo_template}`
}

async function callAnthropic(
  apiKey: string, model: string, system: string, user: string,
): Promise<string> {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 1500, system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 400)}`)
  }
  const data = await resp.json()
  const txt = data?.content?.[0]?.text
  if (typeof txt !== 'string') throw new Error('risposta Anthropic vuota')
  return txt
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

  if (!ANTHROPIC_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 500)
  }

  // --- auth: solo admin ----------------------------------------
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'auth mancante' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'sessione non valida' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return json({ error: 'solo admin' }, 403)

  // --- body ----------------------------------------------------
  const body = await req.json().catch(() => null) as
    { richiesta_id?: string } | null
  const rid = body?.richiesta_id
  if (!rid) return json({ error: 'richiesta_id obbligatorio' }, 400)

  const { data: r } = await admin
    .from('richieste_preventivo')
    .select(`id, tipologia, data_arrivo, data_partenza, periodo_note,
             n_persone, n_accompagnatori, servizi, note,
             email_origine_testo,
             contatto:contatti!inner(nome, cognome, societa_ente, email, telefono)`)
    .eq('id', rid).maybeSingle()
  if (!r) return json({ error: 'richiesta non trovata' }, 404)

  const { data: template } = await admin
    .from('template_risposta')
    .select('oggetto_template, corpo_template')
    .eq('tipologia', r.tipologia).maybeSingle()
  if (!template) return json({ error: 'template mancante per questa tipologia' }, 500)

  const datiEstratti = {
    tipologia: r.tipologia,
    data_arrivo: r.data_arrivo,
    data_partenza: r.data_partenza,
    periodo_note: r.periodo_note,
    n_persone: r.n_persone,
    n_accompagnatori: r.n_accompagnatori,
    servizi: r.servizi,
    note: r.note,
    nome: r.contatto?.nome ?? null,
    cognome: r.contatto?.cognome ?? null,
    societa_ente: r.contatto?.societa_ente ?? null,
  }

  const prompt = `Dati gia' noti della richiesta:
${JSON.stringify(datiEstratti, null, 2)}
${r.email_origine_testo
  ? `\nEmail originale del cliente:\n${r.email_origine_testo}`
  : ''}

Scrivi la bozza del corpo dell'email di risposta.`

  let bozza = ''
  try {
    bozza = await callAnthropic(ANTHROPIC_KEY, MODEL_BOZZA, systemBozza(template), prompt)
  } catch (e) {
    return json({ error: `Anthropic: ${(e as Error).message}` }, 502)
  }

  const { error: errUpd } = await admin
    .from('richieste_preventivo')
    .update({ bozza_risposta: bozza })
    .eq('id', rid)
  if (errUpd) return json({ error: errUpd.message }, 500)

  await admin.from('richieste_eventi').insert({
    richiesta_id: rid,
    utente_id: user.id,
    tipo: 'rigenera_bozza',
    testo: 'Bozza di risposta rigenerata',
  })

  return json({ ok: true, bozza })
})
