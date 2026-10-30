// ============================================================
// Edge Function: preventivi-cron
//
// Chiamata da uno scenario Make schedulato alle 09:00 Europe/Rome.
// Protetta da header x-cron-secret.
//
// Passaggi (idempotenti e sicuri da rieseguire):
//   1. inviato -> attesa      : il giorno dopo data_invio
//   2. inviato/attesa -> scaduta : se data_arrivo < oggi
//   3. seleziona
//        - nuove da gestire (stato=ricevuta)
//        - da ricontattare (soglia follow_up_giorni per tipologia)
//   4. se c'e' almeno una delle due liste: invia riepilogo Telegram
//
// NB: la "stessa email a info@aschotel.com" prevista dalla spec
// originale non e' implementata qui perche' il progetto non ha
// ancora un provider email configurato (admin-users, sign-contract
// e notify-order non ne usano uno). Quando il provider verra'
// scelto, aggiungere qui l'invio: il payload e' lo stesso.
//
// Secret: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PREVENTIVI_CRON_SECRET
// verify_jwt = false  (chiamato da scheduler esterno)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://co.aschotel.com'

// data "oggi" / "ieri" in Europe/Rome come YYYY-MM-DD, ricavata
// senza librerie di terze parti: formato it-IT con la timezone
// esplicita e poi ricompone l'ISO.
function isoDate(d: Date, tz = 'Europe/Rome'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const g = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${g}`
}

function etichettaContatto(c: {
  nome?: string | null; cognome?: string | null; societa_ente?: string | null
}): string {
  if (c.societa_ente) return c.societa_ente
  const nome = [c.nome, c.cognome].filter(Boolean).join(' ').trim()
  return nome || 'Contatto'
}

function tipologiaLabel(t: string): string {
  if (t === 'raduno') return 'Raduno/Gruppo sportivo'
  if (t === 'scuola') return 'Gruppo scolastico'
  if (t === 'famiglia') return 'Famiglia/Singolo'
  return t
}

async function telegramSend(
  token: string, chatId: string, text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    console.error('telegram', resp.status, t.slice(0, 400))
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const CRON_SECRET = Deno.env.get('PREVENTIVI_CRON_SECRET') ?? ''
  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const TG_CHAT  = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''

  const providedSecret = req.headers.get('x-cron-secret') ?? ''
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const oggi = isoDate(new Date())

  // --- 1. inviato -> attesa (il giorno dopo l'invio) -----------
  // Scarta le righe senza data_invio.
  const { data: daMetterInAttesa } = await admin
    .from('richieste_preventivo')
    .select('id, data_invio')
    .eq('stato', 'inviato')
    .not('data_invio', 'is', null)

  let movedToAttesa = 0
  for (const r of daMetterInAttesa ?? []) {
    const giornoInvio = isoDate(new Date(r.data_invio as string))
    if (giornoInvio < oggi) {
      const { error } = await admin
        .from('richieste_preventivo')
        .update({ stato: 'attesa' })
        .eq('id', r.id).eq('stato', 'inviato')  // guardia race
      if (!error) movedToAttesa++
    }
  }

  // --- 2. scaduta: data_arrivo passata, stato ancora pendente --
  const { data: scadute } = await admin
    .from('richieste_preventivo')
    .select('id')
    .in('stato', ['inviato', 'attesa'])
    .not('data_arrivo', 'is', null)
    .lt('data_arrivo', oggi)

  let movedToScaduta = 0
  for (const r of scadute ?? []) {
    const { error } = await admin
      .from('richieste_preventivo')
      .update({ stato: 'scaduta' })
      .eq('id', r.id)
      .in('stato', ['inviato', 'attesa'])
    if (!error) movedToScaduta++
  }

  // --- 3. soglie follow-up -------------------------------------
  const { data: imp } = await admin
    .from('preventivi_impostazioni')
    .select('value')
    .eq('key', 'follow_up_giorni').maybeSingle()
  const soglie = (imp?.value ?? { raduno: 7, scuola: 14, famiglia: 3 }) as
    Record<string, number>

  // --- 4. nuove da gestire -------------------------------------
  const { data: nuove } = await admin
    .from('richieste_preventivo')
    .select(`id, tipologia,
             contatto:contatti!inner(nome, cognome, societa_ente)`)
    .eq('stato', 'ricevuta')
    .order('data_ricevuta', { ascending: true })

  // --- 5. da ricontattare: inviato/attesa senza contatto da N giorni --
  // Il "N" dipende dalla tipologia. In SQL filtrare da JS sarebbe
  // scomodo (OR per 3 tipologie); facciamo un pull e filtriamo in
  // memoria — il volume e' basso (decine di righe al massimo).
  const { data: pendenti } = await admin
    .from('richieste_preventivo')
    .select(`id, tipologia, data_invio, data_ultimo_contatto,
             contatto:contatti!inner(nome, cognome, societa_ente)`)
    .in('stato', ['inviato', 'attesa'])
    .order('data_invio', { ascending: true })

  const oraMs = Date.now()
  const giorni = (iso: string | null) =>
    iso ? Math.floor((oraMs - new Date(iso).getTime()) / 86_400_000) : null

  const daRicontattare = (pendenti ?? []).filter(r => {
    const rif = (r.data_ultimo_contatto as string | null)
      ?? (r.data_invio as string | null)
    const gg = giorni(rif)
    if (gg === null) return false
    const soglia = soglie[r.tipologia] ?? soglie.famiglia ?? 3
    return gg >= soglia
  })

  // --- 6. Telegram ---------------------------------------------
  const righe: string[] = []
  if ((nuove?.length ?? 0) > 0) {
    const etich = (nuove ?? [])
      .slice(0, 10)
      .map(r => etichettaContatto(r.contatto ?? {}))
      .join(', ')
    righe.push(
      `${nuove!.length} nuove da gestire (${etich}${(nuove?.length ?? 0) > 10 ? ', ...' : ''})`,
    )
  }
  if (daRicontattare.length > 0) {
    const etich = daRicontattare
      .slice(0, 10)
      .map(r => etichettaContatto(r.contatto ?? {}))
      .join(', ')
    righe.push(
      `${daRicontattare.length} da ricontattare (${etich}${daRicontattare.length > 10 ? ', ...' : ''})`,
    )
  }

  let telegramSent = false
  if (righe.length > 0 && TG_TOKEN && TG_CHAT) {
    const txt = `Preventivi oggi: ${righe.join('; ')}. ${APP_URL}/admin/preventivi`
    await telegramSend(TG_TOKEN, TG_CHAT, txt)
    telegramSent = true
  }

  return json({
    ok: true,
    data: oggi,
    moved_to_attesa: movedToAttesa,
    moved_to_scaduta: movedToScaduta,
    nuove_count: nuove?.length ?? 0,
    da_ricontattare_count: daRicontattare.length,
    telegram_sent: telegramSent,
  })
})
