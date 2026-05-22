// ============================================================
// Edge Function: notify-order
// Invia una notifica Telegram al gruppo a ogni nuovo ordine
// rosticceria. Innescata da un Database Webhook su INSERT di
// public.orders.
//
// Token e chat_id NON sono hardcodati: vengono da variabili
// d'ambiente (secret della function):
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sono iniettate da Supabase.
//
// Ritorna SEMPRE 200 (anche su errore Telegram) per non innescare
// i retry infiniti del webhook; gli errori vengono loggati.
//
// Deploy:  supabase functions deploy notify-order
// Consigliato: verify_jwt = false (la chiama un webhook, non un utente).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Risposta sempre 200: il webhook non deve ritentare all'infinito.
function ok(status: string): Response {
  return new Response(JSON.stringify({ status }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatEuro(n: unknown): string {
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return '€ ' + num.toFixed(2).replace('.', ',')
}

// Costruisce il testo del messaggio (parse_mode HTML).
function buildMessage(
  order: Record<string, unknown>,
  items: { product_name: string; quantity: number }[],
  slotTime: string | null,
): string {
  const shortId = String(order.id ?? '').slice(-4).toUpperCase() || '????'
  const dest = order.delivery_mode === 'camera'
    ? `Consegna in camera <b>${escapeHtml(order.room_number || '?')}</b>`
    : 'Ritiro in reception'

  const lines: string[] = []
  lines.push('🍔 <b>NUOVO ORDINE ROSTICCERIA</b>')
  lines.push('')
  lines.push(`🧾 Ordine <b>#${shortId}</b>`)
  if (order.customer_name) lines.push(`👤 ${escapeHtml(order.customer_name)}`)
  lines.push(`📍 ${dest}`)
  if (slotTime) lines.push(`🕒 Ritiro ore ${escapeHtml(slotTime)}`)
  lines.push('')
  lines.push('🛒 <b>Prodotti</b>')
  if (items.length) {
    for (const it of items) {
      lines.push(`• ${it.quantity}× ${escapeHtml(it.product_name)}`)
    }
  } else {
    lines.push('• ⚠️ dettaglio non disponibile — controlla nel pannello')
  }
  if (order.notes) {
    lines.push('')
    lines.push(`📝 Note: ${escapeHtml(order.notes)}`)
  }
  lines.push('')
  lines.push(`💶 Totale: <b>${formatEuro(order.total)}</b>`)
  return lines.join('\n')
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. Payload del Database Webhook ---
    // Formato: { type, table, schema, record, old_record }
    const payload = await req.json().catch(() => null)
    const record = payload?.record
    if (payload?.type !== 'INSERT' || payload?.table !== 'orders' || !record?.id) {
      console.log('notify-order: evento ignorato', payload?.type, payload?.table)
      return ok('ignored')
    }

    // --- 2. Config Telegram (da secret) ---
    const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!TOKEN || !CHAT_ID) {
      console.error('notify-order: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID non configurati')
      return ok('missing-config')
    }

    // --- 3. Client service-role per leggere righe ordine e slot ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // order_items con retry: vengono inseriti in una transazione
    // separata DOPO la riga orders, quindi al primo colpo possono
    // non esserci ancora (race col Database Webhook).
    let items: { product_name: string; quantity: number }[] = []
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_name, quantity')
        .eq('order_id', record.id)
      if (error) {
        console.error('notify-order: errore query order_items:', error.message)
      } else if (data && data.length) {
        items = data
        break
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 700))
    }
    if (!items.length) {
      console.error('notify-order: order_items vuoto dopo i retry per ordine', record.id)
    }

    // Orario di ritiro (lo slot esiste già: nessun race, query singola).
    let slotTime: string | null = null
    if (record.slot_id) {
      const { data: slot, error: slotErr } = await supabase
        .from('delivery_slots')
        .select('time')
        .eq('id', record.slot_id)
        .maybeSingle()
      if (slotErr) console.error('notify-order: errore query delivery_slots:', slotErr.message)
      if (slot?.time) slotTime = String(slot.time).slice(0, 5)
    }

    // --- 4. Invio a Telegram ---
    const text = buildMessage(record, items, slotTime)
    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!tgRes.ok) {
      const errBody = await tgRes.text().catch(() => '')
      console.error('notify-order: errore Telegram', tgRes.status, errBody)
      return ok('telegram-error')
    }

    return ok('sent')
  } catch (e) {
    // Errore non gestito: logga ma rispondi 200 lo stesso.
    console.error('notify-order: eccezione', e instanceof Error ? e.message : String(e))
    return ok('error-handled')
  }
})
