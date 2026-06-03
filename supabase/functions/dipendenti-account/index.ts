// ============================================================
// Edge Function: dipendenti-account
// Gestisce le credenziali di accesso dei DIPENDENTI lato server
// con la service role key (mai esposta al browser). Stesso schema
// di admin-users.
//
// Login dipendente: email sintetica <username>@dipendenti.aschotel.local
// + role='dipendente' in profiles + dipendenti.profile_id collegato.
// Il "codice" e' la password Supabase Auth, gestita solo dall'admin.
//
// Sicurezza: ogni azione e' eseguita solo se il chiamante e'
// autenticato E ha role='admin' in profiles.
//
// Deploy:  supabase functions deploy dipendenti-account
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAIL_DOMAIN = 'dipendenti.aschotel.local'

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

    const { data: profile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return json({ error: 'Permesso negato: operazione riservata agli admin' })
    }

    const body = await req.json().catch(() => ({}))
    const action = body?.action

    // ----------------------------------------------------------
    // create: crea l'account auth + profilo + collega il dipendente
    // ----------------------------------------------------------
    if (action === 'create') {
      const dipendente_id = body?.dipendente_id
      const username = String(body?.username ?? '').trim().toLowerCase()
      const codice = String(body?.codice ?? '')
      if (!dipendente_id || !username || !codice) {
        return json({ error: 'dipendente_id, username e codice sono obbligatori' })
      }
      if (!/^[a-z0-9._-]{3,}$/.test(username)) {
        return json({ error: 'Username non valido (min 3 caratteri: lettere, numeri, . _ -)' })
      }
      if (codice.length < 6) {
        return json({ error: 'Il codice deve avere almeno 6 caratteri' })
      }

      // Il dipendente esiste e non ha gia' un accesso?
      const { data: dip, error: dipErr } = await admin
        .from('dipendenti').select('id, profile_id').eq('id', dipendente_id).single()
      if (dipErr || !dip) return json({ error: 'Dipendente non trovato' })
      if (dip.profile_id) return json({ error: 'Questo dipendente ha gia\' un accesso' })

      // Username libero?
      const { data: taken } = await admin
        .from('profiles').select('id').eq('username', username).maybeSingle()
      if (taken) return json({ error: 'Username gia\' in uso, scegline un altro' })

      const email = `${username}@${EMAIL_DOMAIN}`

      // 1. Crea utente auth
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: codice,
        email_confirm: true,
        user_metadata: { role: 'dipendente' },
      })
      if (createErr || !created?.user) {
        return json({ error: 'Creazione utente fallita: ' + (createErr?.message ?? 'sconosciuto') })
      }
      const userId = created.user.id

      // 2. Inserisci profilo
      const { error: profErr } = await admin.from('profiles').insert({
        id: userId, username, email, role: 'dipendente',
      })
      if (profErr) {
        await admin.auth.admin.deleteUser(userId) // rollback
        return json({ error: 'Creazione profilo fallita: ' + profErr.message })
      }

      // 3. Collega il dipendente
      const { error: linkErr } = await admin
        .from('dipendenti').update({ profile_id: userId, username }).eq('id', dipendente_id)
      if (linkErr) {
        await admin.auth.admin.deleteUser(userId) // rollback (profilo cade in cascade)
        return json({ error: 'Collegamento dipendente fallito: ' + linkErr.message })
      }

      return json({ ok: true, username })
    }

    // ----------------------------------------------------------
    // reset-codice: cambia la password dell'account del dipendente
    // ----------------------------------------------------------
    if (action === 'reset-codice') {
      const dipendente_id = body?.dipendente_id
      const codice = String(body?.codice ?? '')
      if (!dipendente_id || !codice) return json({ error: 'dipendente_id e codice obbligatori' })
      if (codice.length < 6) return json({ error: 'Il codice deve avere almeno 6 caratteri' })

      const { data: dip, error: dipErr } = await admin
        .from('dipendenti').select('profile_id').eq('id', dipendente_id).single()
      if (dipErr || !dip?.profile_id) return json({ error: 'Il dipendente non ha un accesso attivo' })

      const { error } = await admin.auth.admin.updateUserById(dip.profile_id, { password: codice })
      if (error) return json({ error: 'Reset codice fallito: ' + error.message })
      return json({ ok: true })
    }

    // ----------------------------------------------------------
    // revoke: elimina l'accesso (utente auth + profilo) e scollega
    // ----------------------------------------------------------
    if (action === 'revoke') {
      const dipendente_id = body?.dipendente_id
      if (!dipendente_id) return json({ error: 'dipendente_id obbligatorio' })

      const { data: dip, error: dipErr } = await admin
        .from('dipendenti').select('profile_id').eq('id', dipendente_id).single()
      if (dipErr || !dip?.profile_id) return json({ error: 'Il dipendente non ha un accesso attivo' })

      // deleteUser elimina la riga profiles in cascade (FK on delete cascade).
      const { error: delErr } = await admin.auth.admin.deleteUser(dip.profile_id)
      if (delErr) return json({ error: 'Rimozione accesso fallita: ' + delErr.message })

      const { error: updErr } = await admin
        .from('dipendenti').update({ profile_id: null, username: null }).eq('id', dipendente_id)
      if (updErr) return json({ error: 'Scollegamento fallito: ' + updErr.message })

      return json({ ok: true })
    }

    return json({ error: 'Azione non riconosciuta: ' + action })
  } catch (e) {
    return json({ error: 'Errore interno: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})
