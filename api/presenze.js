// ============================================================
// Endpoint Vercel: GET /api/presenze?mese=YYYY-MM[&debug=1]
// Riepilogo mensile presenze per il consulente del lavoro (Elledue).
// Pensato per essere invocato da un'attività esterna (Make/cron) a
// inizio mese per generare la mail delle presenze.
//
// Auth:  header `Authorization: Bearer <PRESENZE_API_TOKEN>`.
//        Senza token valido risponde 401.
// Default mese: se `mese` non è passato, usa il mese precedente nel
//        fuso Europe/Rome (es. chiamata il 1° novembre -> '2026-10').
// Debug: con `?debug=1` (sempre dietro il Bearer token) la risposta
//        include un oggetto `debug` con host Supabase, tipo/lunghezza
//        della chiave (mai il valore) e conteggio/errore delle tre
//        query. Utile per diagnosticare la configurazione su Vercel.
//
// Variabili d'ambiente (Vercel → Project Settings → Environment Variables):
//   PRESENZE_API_TOKEN           token condiviso con il chiamante esterno
//   SUPABASE_URL                 URL del progetto Supabase (coworking)
//   SUPABASE_SERVICE_ROLE_KEY    service role (bypassa RLS, non va al browser)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  calcolaRiepilogo, estremiMese, meseLabel, mesePrecedenteRoma, validaMese,
} from '../src/lib/riepilogoPresenze.js'

// Hostname sicuro da mostrare in debug (non espone path, utente, password).
function safeHost(u) {
  try { return new URL(u).hostname } catch { return null }
}

// Classifica la chiave Supabase senza mai stamparla.
// - 'sb_secret' / 'sb_publishable': nuovo formato con prefisso leggibile
// - 'jwt': chiave legacy in formato JWT (inizia con 'eyJ')
// - 'mancante': variabile non impostata o stringa vuota
// - 'sconosciuto': valore presente ma non corrisponde a nessun formato noto
function keyType(k) {
  if (!k) return 'mancante'
  if (k.startsWith('sb_secret')) return 'sb_secret'
  if (k.startsWith('sb_publishable')) return 'sb_publishable'
  if (k.startsWith('eyJ')) return 'jwt'
  return 'sconosciuto'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Metodo non consentito' })
  }

  const expected = process.env.PRESENZE_API_TOKEN
  const authHeader = req.headers.authorization || ''
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Token mancante o non valido' })
  }

  const wantDebug = String(req.query?.debug || '') === '1'

  const mese = (req.query?.mese || '').trim() || mesePrecedenteRoma()
  if (!validaMese(mese)) {
    return res.status(400).json({ error: "Parametro 'mese' non valido, atteso formato YYYY-MM" })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Debug base, compilato prima delle query così è disponibile anche
  // nei rami di errore precoce (config mancante).
  const debug = wantDebug ? {
    supabase_host: safeHost(url),
    key_type: keyType(key),
    key_length: (key || '').length,
  } : null

  if (!url || !key) {
    const body = { error: 'Configurazione Supabase mancante sul server' }
    if (debug) body.debug = debug
    return res.status(500).json(body)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { primo, ultimo } = estremiMese(mese)
  const [dipRes, shiftRes, leaveRes] = await Promise.all([
    supabase.from('dipendenti').select('id,nome,cognome,ordine,a_chiamata,attivo'),
    supabase.from('shifts').select('dipendente_id,data,start_time,end_time')
      .gte('data', primo).lte('data', ultimo),
    supabase.from('leave_requests').select('dipendente_id,type,start_date,end_date')
      .eq('stato', 'approved').lte('start_date', ultimo).gte('end_date', primo),
  ])

  if (debug) {
    debug.dipendenti     = { count: dipRes.data?.length   ?? 0, error: dipRes.error?.message   || null }
    debug.shifts         = { count: shiftRes.data?.length ?? 0, error: shiftRes.error?.message || null }
    debug.leave_requests = { count: leaveRes.data?.length ?? 0, error: leaveRes.error?.message || null }
  }

  const err = dipRes.error || shiftRes.error || leaveRes.error
  if (err) {
    const body = { error: 'Errore query Supabase', dettaglio: err.message }
    if (debug) body.debug = debug
    return res.status(500).json(body)
  }

  let lavoratori
  try {
    lavoratori = calcolaRiepilogo({
      mese,
      dipendenti: dipRes.data || [],
      shifts: shiftRes.data || [],
      leaves: leaveRes.data || [],
    })
  } catch (e) {
    const body = { error: 'Errore aggregazione', dettaglio: e.message }
    if (debug) body.debug = debug
    return res.status(500).json(body)
  }

  res.setHeader('Cache-Control', 'no-store')
  const body = {
    mese,
    mese_label: meseLabel(mese),
    lavoratori,
    generato_il: new Date().toISOString(),
  }
  if (debug) body.debug = debug
  return res.status(200).json(body)
}
