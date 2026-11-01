// ============================================================
// Edge Function: preventivi-importa-ora
//
// Fa partire via Make API due scenari in sequenza:
//   1. import Gmail (label Preventivo)         -> MAKE_SCENARIO_ID_GMAIL
//   2. sync conversazioni dei thread aperti    -> MAKE_SCENARIO_ID_SYNC
// Usata dal bottone "Importa email etichettate Preventivo" (tab Oggi)
// e da "Aggiorna conversazione" nella scheda (body {solo:'sync'}).
//
// L'import viene lanciato prima in modalita' "responsive": Make tiene
// aperta la chiamata fino alla fine dello scenario, cosi' il frontend
// sa che puo' contare subito le righe nuove ("Importate N richieste").
// Se l'API rifiuta quella modalita' (422) si ripiega sul lancio normale
// e il frontend aspetta qualche secondo prima di contare.
//
// Il polling automatico quotidiano Make lo fa alle 06:00 (import) e
// 06:15 (sync); questa funzione serve quando la reception vuole
// vedere subito senza aspettare il prossimo giro.
//
// Secret: MAKE_API_TOKEN (scope scenarios:run), MAKE_SCENARIO_ID_GMAIL,
//         MAKE_SCENARIO_ID_SYNC (opz.), MAKE_ZONE (opz., default eu1)
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

async function runScenario(zone: string, token: string, id: string, responsive: boolean): Promise<{ ok: boolean; status: number; raw: string }> {
  try {
    const resp = await fetch(`https://${zone}.make.com/api/v2/scenarios/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
      body: responsive ? JSON.stringify({ data: {}, responsive: true }) : '{}',
    })
    const raw = await resp.text()
    return { ok: resp.ok, status: resp.status, raw }
  } catch (e) {
    return { ok: false, status: 0, raw: (e as Error).message }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const MAKE_TOKEN = Deno.env.get('MAKE_API_TOKEN') ?? ''
  const ID_GMAIL = Deno.env.get('MAKE_SCENARIO_ID_GMAIL') ?? '8277056'
  const ID_SYNC = Deno.env.get('MAKE_SCENARIO_ID_SYNC') ?? '8279557'
  const ZONE = Deno.env.get('MAKE_ZONE') ?? 'eu1'

  if (!MAKE_TOKEN) return json({ error: 'MAKE_API_TOKEN non configurato' }, 500)

  // --- auth: solo admin ----------------------------------------
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'auth mancante' }, 401)
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'sessione non valida' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return json({ error: 'solo admin' }, 403)

  const body = await req.json().catch(() => ({})) as { solo?: 'gmail' | 'sync' }

  const esiti: Record<string, unknown> = {}
  let finished = false
  if (body.solo !== 'sync') {
    let r = await runScenario(ZONE, MAKE_TOKEN, ID_GMAIL, true)
    if (r.ok) {
      finished = true
    } else if (r.status === 422) {
      // modalita' responsive non accettata: lancio normale
      r = await runScenario(ZONE, MAKE_TOKEN, ID_GMAIL, false)
      if (!r.ok) return json({ error: `Make import Gmail HTTP ${r.status}: ${r.raw.slice(0, 300)}`, esiti }, 502)
    } else if (r.status === 0 || r.status >= 500 || r.status === 408) {
      // Make ha chiuso la chiamata prima della fine (scenario lungo):
      // lo scenario e' comunque partito, non lo rilanciamo.
      finished = false
    } else {
      return json({ error: `Make import Gmail HTTP ${r.status}: ${r.raw.slice(0, 300)}`, esiti }, 502)
    }
    esiti.gmail = { ok: true, status: r.status, finished }
  }
  if (body.solo !== 'gmail') {
    const r = await runScenario(ZONE, MAKE_TOKEN, ID_SYNC, false)
    esiti.sync = { ok: r.ok, status: r.status }
    if (!r.ok && !/already/i.test(r.raw)) {
      return json({ error: `Make sync HTTP ${r.status}: ${r.raw.slice(0, 300)}`, esiti }, 502)
    }
  }
  return json({ ok: true, finished, esiti })
})
