// ============================================================
// Edge Function: preventivi-importa-ora
//
// Fa partire a mano lo scenario Make che importa i preventivi dalla
// Gmail etichettata. Usata dal bottone "Controlla Gmail adesso" nella
// pagina admin Preventivi > Oggi.
//
// Il polling automatico quotidiano Make lo fa alle 06:00; questa
// funzione serve quando la reception vuole importare subito senza
// aspettare il prossimo giro.
//
// Secret:
//   MAKE_API_TOKEN         token Make con scope scenarios:run
//   MAKE_SCENARIO_ID_GMAIL id numerico dello scenario (es. 8277056)
//   MAKE_ZONE              zona Make (default eu1)
// verify_jwt = true (chiamato da utente admin loggato)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const MAKE_TOKEN = Deno.env.get('MAKE_API_TOKEN') ?? ''
  const SCENARIO_ID = Deno.env.get('MAKE_SCENARIO_ID_GMAIL') ?? ''
  const ZONE = Deno.env.get('MAKE_ZONE') ?? 'eu1'

  if (!MAKE_TOKEN) return json({ error: 'MAKE_API_TOKEN non configurato' }, 500)
  if (!SCENARIO_ID) return json({ error: 'MAKE_SCENARIO_ID_GMAIL non configurato' }, 500)

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
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return json({ error: 'solo admin' }, 403)

  // --- Make API: /api/v2/scenarios/{id}/run --------------------
  // Il token Make va come Authorization: Token <TOKEN>
  const url = `https://${ZONE}.make.com/api/v2/scenarios/${SCENARIO_ID}/run`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MAKE_TOKEN}`,
      },
      body: JSON.stringify({ responsive: true }),
    })
  } catch (e) {
    return json({ error: `Make unreachable: ${(e as Error).message}` }, 502)
  }

  const raw = await resp.text()
  if (!resp.ok) {
    return json({
      error: `Make HTTP ${resp.status}`,
      details: raw.slice(0, 500),
    }, 502)
  }

  let data: any = null
  try { data = JSON.parse(raw) } catch { /* ignore */ }

  return json({
    ok: true,
    execution_id: data?.result?.executionId ?? null,
    status: data?.result?.status ?? null,
  })
})
