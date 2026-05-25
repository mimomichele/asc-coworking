// ============================================================
// Edge Function: admin-users
// Esegue le operazioni privilegiate sugli utenti — createUser,
// updateUserById (password), deleteUser — LATO SERVER.
// La service role key resta nell'ambiente della funzione e non
// viene mai inviata al browser. Sostituisce src/lib/supabaseAdmin.js.
//
// Sicurezza: ogni chiamata e' eseguita solo se il chiamante e'
// autenticato E ha role='admin' nella tabella profiles.
//
// Deploy:  supabase functions deploy admin-users
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//  sono iniettate automaticamente da Supabase nell'ambiente.)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!

    // --- 1. Identifica il chiamante dal suo JWT ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Autenticazione mancante' })

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessione non valida' })

    // --- 2. Client service-role: controllo ruolo + operazioni ---
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Solo gli admin possono usare questa funzione.
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return json({ error: 'Permesso negato: operazione riservata agli admin' })
    }

    // --- 3. Dispatch dell'azione ---
    const body = await req.json().catch(() => ({}))
    const action = body?.action

    if (action === 'create') {
      const { email, password, user_metadata } = body
      if (!email || !password) return json({ error: 'Email e password obbligatorie' })
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: user_metadata ?? {},
      })
      if (error) return json({ error: error.message })
      return json({ user: data.user })
    }

    if (action === 'update-password') {
      const { user_id, password } = body
      if (!user_id || !password) return json({ error: 'user_id e password obbligatori' })
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message })
      return json({ ok: true })
    }

    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id obbligatorio' })
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message })
      return json({ ok: true })
    }

    // Disattivazione "soft": ban Auth (di fatto permanente) + flag DB
    // accounts.attivo=false + cancellazione bookings future.
    // Tutti i dati restano in DB per contabilita'; reversibile con 'enable'.
    if (action === 'disable') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id obbligatorio' })

      // 1. Ban Auth: 876000h ~ 100 anni = di fatto permanente.
      //    Supabase Auth non ha un flag "permanent": una durata molto lunga
      //    e' la convenzione. Per riattivare, ban_duration: 'none'.
      const { error: banErr } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h',
      })
      if (banErr) {
        console.error('admin-users disable: ban failed:', banErr.message)
        return json({ error: 'Impossibile bannare l\'utente auth: ' + banErr.message })
      }

      // 2. Recupera l'account collegato (owner_id = user_id).
      const { data: acc, error: accErr } = await admin
        .from('accounts').select('id').eq('owner_id', user_id).maybeSingle()
      if (accErr) console.error('admin-users disable: select account:', accErr.message)

      let cancelled_bookings = 0
      if (acc?.id) {
        // 3. Flag DB attivo=false.
        const { error: updErr } = await admin
          .from('accounts').update({ attivo: false }).eq('id', acc.id)
        if (updErr) console.error('admin-users disable: update accounts:', updErr.message)

        // 4. Cancella le prenotazioni future (oggi e seguenti) non gia' cancellate.
        //    "Oggi" in fuso Europe/Rome (Edge Function gira in UTC).
        //    NB: entries_used delle subscriptions NON viene toccato:
        //    disattivazione amministrativa, non rimborso.
        const todayIT = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
        const { data: cancelled, error: bkErr } = await admin
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('account_id', acc.id)
          .gte('date', todayIT)
          .neq('status', 'cancelled')
          .select('id')
        if (bkErr) console.error('admin-users disable: cancel bookings:', bkErr.message)
        cancelled_bookings = cancelled?.length ?? 0
      }

      return json({ ok: true, cancelled_bookings })
    }

    // Riattivazione: speculare a 'disable'. Le bookings cancellate restano
    // cancellate (non si ripristinano): se l'ospite riprende, riprenota.
    if (action === 'enable') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id obbligatorio' })

      // 1. Unban Auth.
      const { error: unbanErr } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
      })
      if (unbanErr) {
        console.error('admin-users enable: unban failed:', unbanErr.message)
        return json({ error: 'Impossibile riattivare l\'utente auth: ' + unbanErr.message })
      }

      // 2. Flag DB attivo=true.
      const { data: acc, error: accErr } = await admin
        .from('accounts').select('id').eq('owner_id', user_id).maybeSingle()
      if (accErr) console.error('admin-users enable: select account:', accErr.message)
      if (acc?.id) {
        const { error: updErr } = await admin
          .from('accounts').update({ attivo: true }).eq('id', acc.id)
        if (updErr) console.error('admin-users enable: update accounts:', updErr.message)
      }

      return json({ ok: true })
    }

    return json({ error: 'Azione non riconosciuta: ' + action })
  } catch (e) {
    return json({ error: 'Errore interno: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})
