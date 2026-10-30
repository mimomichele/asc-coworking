// ============================================================
// Edge Function: preventivi-sync-thread
//
// Riceve da Make un thread Gmail (JSON della API threads.get con
// format=full) e lo riversa in richieste_messaggi: una riga per
// messaggio, direzione in/out in base al mittente (HOTEL_EMAILS).
// Sulla richiesta aggiorna contatori e ultimo messaggio, promuove
// ricevuta -> inviato al primo messaggio in uscita, aggiorna
// data_ultimo_contatto, e avvisa su Telegram per ogni NUOVA risposta
// del cliente (non il messaggio originale).
//
// Body (urlencoded o JSON): richiesta_id, thread_json (stringa JSON).
// Secret: PREVENTIVI_CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
//         APP_URL (opz.), HOTEL_EMAILS (opz., csv; default info@aschotel.com
//         e arezzo.sport.college@gmail.com)
// verify_jwt = false (chiamato da Make)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function readBody(req: Request): Promise<Record<string, any>> {
  const ctype = (req.headers.get('content-type') ?? '').toLowerCase()
  const raw = await req.text()
  if (!raw) return {}
  if (ctype.includes('application/x-www-form-urlencoded')) {
    const out: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v
    return out
  }
  try { const j = JSON.parse(raw); if (j && typeof j === 'object') return j } catch {}
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v
  return out
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

// Cerca ricorsivamente la prima parte MIME del tipo richiesto.
function findPart(payload: any, mime: string): string | null {
  if (!payload) return null
  if (payload.mimeType === mime && payload.body?.data) return b64urlDecode(payload.body.data)
  for (const p of payload.parts ?? []) {
    const r = findPart(p, mime)
    if (r) return r
  }
  return null
}

function stripHtml(h: string): string {
  return h
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

// Toglie la parte citata delle reply ("Il giorno ... ha scritto:",
// "On ... wrote:", righe che iniziano con >).
function pulisciQuote(t: string): string {
  const idx = t.search(/(^|\n)\s*(Il giorno |On .{0,300}?wrote:|Da: |From: |-{3,}\s*Original Message)/s)
  let out = idx >= 0 ? t.slice(0, idx) : t
  out = out.split('\n').filter(l => !l.trim().startsWith('>')).join('\n')
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

function header(msg: any, name: string): string {
  const h = (msg?.payload?.headers ?? []).find((x: any) => (x.name ?? '').toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function parseFrom(v: string): { name: string | null; email: string | null } {
  const m = v.match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  const e = v.trim().toLowerCase()
  return { name: null, email: e.includes('@') ? e : null }
}

async function telegramSend(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!r.ok) console.error('telegram', r.status, (await r.text()).slice(0, 300))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const CRON_SECRET = Deno.env.get('PREVENTIVI_CRON_SECRET') ?? ''
  if (!CRON_SECRET || (req.headers.get('x-cron-secret') ?? '') !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const TG_CHAT = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://co.aschotel.com'
  const HOTEL = (Deno.env.get('HOTEL_EMAILS') ?? 'info@aschotel.com,arezzo.sport.college@gmail.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  const body = await readBody(req)
  const richiestaId = String(body.richiesta_id ?? '').trim()
  if (!richiestaId) return json({ error: 'richiesta_id obbligatorio' }, 400)

  let thread: any = body.thread_json ?? body.thread
  if (typeof thread === 'string') {
    try { thread = JSON.parse(thread) } catch {
      return json({ error: 'thread_json non e\' JSON valido', ricevuto: String(thread).slice(0, 200) }, 400)
    }
  }
  const messages: any[] = Array.isArray(thread?.messages) ? thread.messages : []
  if (messages.length === 0) return json({ ok: true, nuovi: 0, nota: 'thread senza messaggi' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: r } = await admin.from('richieste_preventivo')
    .select('id, stato, data_invio, data_ultimo_contatto, email_origine_id, contatto:contatti!inner(nome, cognome, societa_ente)')
    .eq('id', richiestaId).maybeSingle()
  if (!r) return json({ error: 'richiesta non trovata' }, 404)

  // --- normalizza i messaggi -------------------------------------
  const righe = messages.map(m => {
    const from = parseFrom(header(m, 'From'))
    const plain = findPart(m.payload, 'text/plain')
    const html = plain ? null : findPart(m.payload, 'text/html')
    const testoRaw = plain ?? (html ? stripHtml(html) : (m.snippet ?? ''))
    const direzione = from.email && HOTEL.includes(from.email) ? 'out' : 'in'
    const ms = Number(m.internalDate)
    return {
      richiesta_id: richiestaId,
      gmail_message_id: String(m.id),
      gmail_thread_id: String(m.threadId ?? thread.id ?? ''),
      direzione,
      from_email: from.email,
      from_name: from.name,
      subject: header(m, 'Subject') || null,
      testo: pulisciQuote(testoRaw).slice(0, 20000) || null,
      snippet: (m.snippet ?? '').slice(0, 500) || null,
      data: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null,
    }
  }).filter(x => x.gmail_message_id)

  // --- quali sono nuovi? -------------------------------------------
  const { data: esistenti } = await admin.from('richieste_messaggi')
    .select('gmail_message_id').eq('richiesta_id', richiestaId)
  const noti = new Set((esistenti ?? []).map(x => x.gmail_message_id))
  const nuovi = righe.filter(x => !noti.has(x.gmail_message_id))

  if (nuovi.length > 0) {
    const { error } = await admin.from('richieste_messaggi')
      .upsert(nuovi, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
    if (error) return json({ error: `insert messaggi: ${error.message}` }, 500)
  }

  // --- aggiorna la richiesta --------------------------------------
  const ordinati = [...righe].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
  const ultimo = ordinati[ordinati.length - 1]
  const outs = ordinati.filter(x => x.direzione === 'out')
  const ins = ordinati.filter(x => x.direzione === 'in')
  const primoOut = outs[0]?.data ?? null
  const ultimoOut = outs[outs.length - 1]?.data ?? null

  const upd: Record<string, unknown> = {
    n_msg_in: ins.length,
    n_msg_out: outs.length,
    ultimo_msg_direzione: ultimo?.direzione ?? null,
    ultimo_msg_at: ultimo?.data ?? null,
  }
  if (ultimoOut && (!r.data_ultimo_contatto || ultimoOut > r.data_ultimo_contatto)) {
    upd.data_ultimo_contatto = ultimoOut
  }
  if (r.stato === 'ricevuta' && outs.length > 0) {
    upd.stato = 'inviato'
    if (!r.data_invio && primoOut) upd.data_invio = primoOut
  }
  const { error: errUpd } = await admin.from('richieste_preventivo').update(upd).eq('id', richiestaId)
  if (errUpd) return json({ error: `update richiesta: ${errUpd.message}` }, 500)

  // --- Telegram: nuove risposte del cliente (non il messaggio originale) ---
  const nuoveIn = nuovi.filter(x => x.direzione === 'in' && x.gmail_message_id !== r.email_origine_id)
  if (nuoveIn.length > 0 && TG_TOKEN && TG_CHAT) {
    const c: any = r.contatto ?? {}
    const chi = c.societa_ente || [c.nome, c.cognome].filter(Boolean).join(' ') || 'Contatto'
    const last = nuoveIn[nuoveIn.length - 1]
    const anteprima = (last.testo ?? last.snippet ?? '').replace(/\s+/g, ' ').slice(0, 160)
    await telegramSend(TG_TOKEN, TG_CHAT,
      `Risposta del cliente: ${chi} - "${anteprima}" - ${APP_URL}/admin/preventivi/richiesta/${richiestaId}`)
  }

  return json({ ok: true, messaggi: righe.length, nuovi: nuovi.length, nuove_risposte: nuoveIn.length, stato: upd.stato ?? r.stato })
})
