// ============================================================
// Edge Function: preventivi-da-email
//
// Webhook chiamato da Make quando in Gmail (info@aschotel.com /
// alias di arezzo.sport.college@gmail.com) viene applicata a mano
// l'etichetta "Preventivo".
//
// Accetta body JSON OPPURE application/x-www-form-urlencoded.
// Il secondo e' quello che manda Make (HTTP > Make a request
// contentType=urlEncoded): evita escape issues con virgolette e
// newline nel corpo email.
//
// Flusso:
//   1. verifica x-webhook-secret contro PREVENTIVI_WEBHOOK_SECRET
//   2. idempotenza su gmail_message_id (se gia' importato, no-op)
//   3. estrazione campi via Claude Haiku 5.5
//   4. dedup contatto per email (citext)
//   5. generazione bozza via Claude Sonnet 5.5 col template della tipologia
//   6. insert richiesta in stato 'ricevuta'
//
// Secret: ANTHROPIC_API_KEY, PREVENTIVI_WEBHOOK_SECRET
// Opzionali: AI_MODEL_ESTRAZIONE (default claude-haiku-5-5),
//            AI_MODEL_BOZZA (default claude-sonnet-5-5)
// verify_jwt = false (chiamato da Make)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL_ESTRAZIONE = Deno.env.get('AI_MODEL_ESTRAZIONE') ?? 'claude-haiku-5-5'
const MODEL_BOZZA = Deno.env.get('AI_MODEL_BOZZA') ?? 'claude-sonnet-5-5'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Tipologia = 'raduno' | 'scuola' | 'famiglia'
const TIPOLOGIE: Tipologia[] = ['raduno', 'scuola', 'famiglia']

type Estratto = {
  tipologia: Tipologia
  data_arrivo: string | null
  data_partenza: string | null
  periodo_note: string | null
  n_persone: number | null
  n_accompagnatori: number | null
  servizi: string[]
  societa_ente: string | null
  telefono: string | null
  note: string | null
  nome: string | null
  cognome: string | null
}

const SERVIZI_VALIDI = new Set(['pernottamento', 'pasti', 'piscina', 'campi', 'altro'])

function parseJsonFromText(text: string): unknown {
  const first = text.indexOf('{')
  if (first < 0) throw new Error('nessun JSON in risposta')
  let depth = 0
  for (let i = first; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return JSON.parse(text.slice(first, i + 1))
    }
  }
  throw new Error('JSON non bilanciato')
}

// Estrae il primo blocco di tipo text dalla content[] di Anthropic
// (i modelli recenti antepongono blocchi 'thinking' con signature).
function extractText(data: any): string | null {
  const content = Array.isArray(data?.content) ? data.content : []
  for (const b of content) {
    if (b && b.type === 'text' && typeof b.text === 'string') return b.text
  }
  return null
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string, maxTokens = 2500): Promise<string> {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const raw = await resp.text()
  if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${raw.slice(0, 400)}`)
  const data = (() => { try { return JSON.parse(raw) } catch { return null } })()
  const txt = extractText(data)
  if (!txt) throw new Error(`Anthropic risposta senza text block: ${raw.slice(0, 400)}`)
  return txt
}

function sanitize(raw: unknown): Estratto {
  const o = (raw ?? {}) as Record<string, unknown>
  const tipologia = TIPOLOGIE.includes(o.tipologia as Tipologia)
    ? (o.tipologia as Tipologia) : 'famiglia'
  const serviziIn = Array.isArray(o.servizi) ? o.servizi : []
  const servizi = Array.from(new Set(
    serviziIn.filter((x): x is string => typeof x === 'string')
      .map(s => s.toLowerCase().trim())
      .filter(s => SERVIZI_VALIDI.has(s))
  ))
  const isoDate = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  }
  const posInt = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 && n < 10000 ? Math.floor(n) : null
  }
  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
  }
  return {
    tipologia,
    data_arrivo: isoDate(o.data_arrivo),
    data_partenza: isoDate(o.data_partenza),
    periodo_note: str(o.periodo_note),
    n_persone: posInt(o.n_persone),
    n_accompagnatori: posInt(o.n_accompagnatori),
    servizi,
    societa_ente: str(o.societa_ente),
    telefono: str(o.telefono),
    note: str(o.note),
    nome: str(o.nome),
    cognome: str(o.cognome),
  }
}

const SYSTEM_ESTRAZIONE = `Sei un assistente della reception di ASC Hotel. Dato il testo di una email di richiesta preventivo, estrai in JSON i campi utili per compilare la scheda richiesta.

Rispondi SOLO con un oggetto JSON valido, senza testo attorno, senza markdown, senza code fence.

Campi (tutti opzionali tranne tipologia):
- tipologia: una tra "raduno" (gruppo sportivo/raduno), "scuola" (gruppo scolastico/scambio), "famiglia" (famiglia o singolo). In dubbio: "famiglia".
- data_arrivo, data_partenza: ISO YYYY-MM-DD se presenti e certe, altrimenti null.
- periodo_note: se le date non sono precise, stringa libera; altrimenti null.
- n_persone: intero (totale persone) o null.
- n_accompagnatori: intero o null.
- servizi: array con sole chiavi fra ["pernottamento","pasti","piscina","campi","altro"]; vuoto se non detto.
- societa_ente: nome gruppo/scuola/societa' se presente, altrimenti null.
- telefono: numero come scritto nell'email, altrimenti null.
- note: dettagli utili non catturati dai campi sopra, max 500 caratteri; altrimenti null.
- nome, cognome: estratti dalla firma o dal mittente. Null se dubbi.

Nessun valore inventato. Niente supposizioni sui prezzi.`

function systemBozza(template: { oggetto_template: string; corpo_template: string }): string {
  return `Sei la reception di ASC Hotel. Scrivi la BOZZA della risposta all'email del cliente usando il template fornito, personalizzando saluto, riferimento alle date/al gruppo/ai servizi richiesti e tono.

REGOLE RIGIDE:
- Mantieni TUTTI i segnaposto fra parentesi quadre che iniziano con [PREZZO ...] (es. [PREZZO notte], [PREZZO pasto], [PREZZO piscina]). Non sostituirli con numeri. Mai inventare prezzi.
- Altri segnaposto ([NOME], [COGNOME], [DATE], [N_PERSONE], [N_ACCOMPAGNATORI], [SERVIZI], [NOME_GRUPPO], [VALIDITA]) vanno sostituiti coi dati ricavati dall'email; se un dato manca, lascia il segnaposto cosi' com'e'.
- Firma con "Reception ASC Hotel".
- Nessuna emoji. Italiano formale ma caldo.
- Rispondi SOLO con il corpo dell'email (testo semplice, niente markdown, niente code fence). Non includere l'oggetto.

TEMPLATE (oggetto a titolo di riferimento, non ripeterlo nel corpo):
Oggetto: ${template.oggetto_template}

Corpo:
${template.corpo_template}`
}

// Estrae il body in modo tollerante: JSON, form-urlencoded, o testo semplice.
async function readBody(req: Request): Promise<Record<string, string>> {
  const ctype = (req.headers.get('content-type') ?? '').toLowerCase()
  const raw = await req.text()
  if (!raw) return {}
  if (ctype.includes('application/json')) {
    try {
      const j = JSON.parse(raw)
      return (j && typeof j === 'object') ? j as Record<string, string> : {}
    } catch { return {} }
  }
  if (ctype.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw)
    const out: Record<string, string> = {}
    for (const [k, v] of params) out[k] = v
    return out
  }
  // tentativo opportunistico: prima JSON, poi urlencoded
  try {
    const j = JSON.parse(raw)
    if (j && typeof j === 'object') return j as Record<string, string>
  } catch {}
  try {
    const params = new URLSearchParams(raw)
    const out: Record<string, string> = {}
    for (const [k, v] of params) out[k] = v
    if (Object.keys(out).length > 0) return out
  } catch {}
  return {}
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const WEBHOOK_SECRET = Deno.env.get('PREVENTIVI_WEBHOOK_SECRET') ?? ''
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

  const providedSecret = req.headers.get('x-webhook-secret') ?? ''
  if (!WEBHOOK_SECRET || providedSecret !== WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 500)

  const body = await readBody(req)
  const fromEmail = (body.from_email ?? '').trim().toLowerCase()
  const bodyText = (body.body_text ?? '').trim()
  if (!fromEmail || !bodyText) return json({ error: 'from_email e body_text obbligatori' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (body.gmail_message_id) {
    const { data: giaPresente } = await admin.from('richieste_preventivo')
      .select('id').eq('email_origine_id', body.gmail_message_id).maybeSingle()
    if (giaPresente?.id) return json({ ok: true, richiesta_id: giaPresente.id, duplicate: true })
  }

  let estratto: Estratto
  try {
    const prompt = `Mittente: ${body.from_name ?? ''} <${fromEmail}>\nOggetto: ${body.subject ?? ''}\n\nCorpo:\n${bodyText}`
    const raw = await callAnthropic(ANTHROPIC_KEY, MODEL_ESTRAZIONE, SYSTEM_ESTRAZIONE, prompt, 1500)
    estratto = sanitize(parseJsonFromText(raw))
  } catch (e) {
    console.error('estrazione fallita:', e)
    estratto = sanitize({ tipologia: 'famiglia' })
  }

  const { data: contattoEsistente } = await admin.from('contatti')
    .select('id, nome, cognome, societa_ente, telefono, member_id')
    .eq('email', fromEmail).maybeSingle()

  let contattoId: string
  if (contattoEsistente?.id) {
    contattoId = contattoEsistente.id
    const update: Record<string, unknown> = {}
    if (!contattoEsistente.nome && estratto.nome) update.nome = estratto.nome
    if (!contattoEsistente.cognome && estratto.cognome) update.cognome = estratto.cognome
    if (!contattoEsistente.societa_ente && estratto.societa_ente) update.societa_ente = estratto.societa_ente
    if (!contattoEsistente.telefono && estratto.telefono) update.telefono = estratto.telefono
    if (Object.keys(update).length > 0) await admin.from('contatti').update(update).eq('id', contattoId)
  } else {
    const nomeFallback = estratto.nome ?? ((body.from_name ?? '').split(/\s+/)[0] || 'Contatto')
    const cognomeFallback = estratto.cognome ?? ((body.from_name ?? '').split(/\s+/).slice(1).join(' ') || null)
    const { data: nuovo, error: errContatto } = await admin.from('contatti').insert({
      nome: nomeFallback, cognome: cognomeFallback, societa_ente: estratto.societa_ente,
      email: fromEmail, telefono: estratto.telefono,
    }).select('id').single()
    if (errContatto || !nuovo) return json({ error: `creazione contatto: ${errContatto?.message}` }, 500)
    contattoId = nuovo.id
  }

  const { data: template } = await admin.from('template_risposta')
    .select('oggetto_template, corpo_template').eq('tipologia', estratto.tipologia).maybeSingle()

  let bozza = ''
  if (template) {
    try {
      bozza = await callAnthropic(ANTHROPIC_KEY, MODEL_BOZZA, systemBozza(template),
        `Dati estratti dall'email del cliente:\n${JSON.stringify(estratto, null, 2)}\n\nMittente: ${body.from_name ?? ''} <${fromEmail}>\n\nScrivi la bozza del corpo dell'email di risposta.`, 2500)
    } catch (e) {
      console.error('bozza fallita:', e)
      bozza = template.corpo_template
    }
  }

  const { data: richiesta, error: errRichiesta } = await admin.from('richieste_preventivo').insert({
    contatto_id: contattoId, tipologia: estratto.tipologia, canale: 'email',
    data_arrivo: estratto.data_arrivo, data_partenza: estratto.data_partenza,
    periodo_note: estratto.periodo_note, n_persone: estratto.n_persone,
    n_accompagnatori: estratto.n_accompagnatori, servizi: estratto.servizi,
    note: estratto.note, stato: 'ricevuta',
    email_origine_id: body.gmail_message_id ?? null,
    email_origine_testo: bodyText,
    email_origine_link: body.link ?? null,
    bozza_risposta: bozza || null,
  }).select('id').single()

  if (errRichiesta || !richiesta) return json({ error: `creazione richiesta: ${errRichiesta?.message}` }, 500)

  await admin.from('richieste_eventi').insert({
    richiesta_id: richiesta.id, tipo: 'email_import',
    testo: `Importata da Gmail (${body.gmail_message_id ?? 'senza id'})`,
  })

  return json({ ok: true, richiesta_id: richiesta.id })
})
