// ============================================================
// Edge Function: preventivi-notify-nuovo
//
// Invocata da un Database Webhook su INSERT di public.richieste_preventivo.
// Manda a Telegram una riga breve con autore + persone + link alla scheda.
// Vale per TUTTE le origini: email (via preventivi-da-email) e manuali
// (via la pagina Nuova richiesta).
//
// Secret: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, APP_URL
// verify_jwt = false (chiamato da webhook interno)
// Risponde SEMPRE 200 cosi' il webhook non ritenta all'infinito.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function ok(status: string): Response {
  return new Response(JSON.stringify({ status }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function etichettaContatto(c: {
  nome?: string | null; cognome?: string | null; societa_ente?: string | null
}): string {
  if (!c) return 'Contatto'
  if (c.societa_ente) return c.societa_ente
  const nome = [c.nome, c.cognome].filter(Boolean).join(' ').trim()
  return nome || 'Contatto'
}

function tipologiaLabel(t: string): string {
  if (t === 'raduno') return 'Raduno/gruppo sportivo'
  if (t === 'scuola') return 'Gruppo scolastico'
  if (t === 'famiglia') return 'Famiglia/singolo'
  return t
}

async function telegramSend(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    console.error('telegram', resp.status, t.slice(0, 400))
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return ok('method_ignored')

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const TG_CHAT = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://co.aschotel.com'

  if (!TG_TOKEN || !TG_CHAT) return ok('telegram_non_configurato')

  const payload = await req.json().catch(() => null) as any
  const record = payload?.record
  if (!record?.id || !record?.contatto_id) return ok('record_invalido')

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: contatto } = await admin
    .from('contatti')
    .select('nome, cognome, societa_ente')
    .eq('id', record.contatto_id)
    .maybeSingle()

  const chi = etichettaContatto(contatto ?? {})
  const tipo = tipologiaLabel(record.tipologia)
  const pezzi: string[] = [`Nuovo preventivo: ${chi}`, tipo]
  if (record.n_persone) pezzi.push(`${record.n_persone} persone`)
  const dateStr = record.data_arrivo && record.data_partenza
    ? `${record.data_arrivo} > ${record.data_partenza}`
    : (record.data_arrivo || record.periodo_note || '')
  if (dateStr) pezzi.push(dateStr)
  const link = `${APP_URL}/admin/preventivi/richiesta/${record.id}`
  pezzi.push(link)

  await telegramSend(TG_TOKEN, TG_CHAT, pezzi.join(' - '))
  return ok('sent')
})
