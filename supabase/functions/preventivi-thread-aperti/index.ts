// ============================================================
// Edge Function: preventivi-thread-aperti
//
// Restituisce i thread Gmail delle richieste ancora aperte (ricevuta /
// inviato / attesa) che hanno un email_origine_thread_id. Lo scenario
// Make "Sync conversazioni Gmail" itera su questa lista, legge ogni
// thread via Gmail API (threads.get format=full) e lo passa a
// preventivi-sync-thread.
//
// Query string opzionale: ?richiesta_id=<uuid> per sincronizzarne una sola.
// Secret: PREVENTIVI_CRON_SECRET (header x-cron-secret)
// verify_jwt = false (chiamato da Make)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const CRON_SECRET = Deno.env.get('PREVENTIVI_CRON_SECRET') ?? ''
  if (!CRON_SECRET || (req.headers.get('x-cron-secret') ?? '') !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const url = new URL(req.url)
  const soloId = url.searchParams.get('richiesta_id')

  let q = admin.from('richieste_preventivo')
    .select('id, email_origine_thread_id')
    .not('email_origine_thread_id', 'is', null)
  q = soloId ? q.eq('id', soloId) : q.in('stato', ['ricevuta', 'inviato', 'attesa'])

  const { data, error } = await q.order('data_ricevuta', { ascending: false }).limit(200)
  if (error) return json({ error: error.message }, 500)

  const threads = (data ?? []).map(r => ({
    richiesta_id: r.id,
    thread_id: r.email_origine_thread_id,
  }))
  return json({ ok: true, count: threads.length, threads })
})
