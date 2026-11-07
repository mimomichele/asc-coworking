// ============================================================
// Endpoint Vercel: GET /api/presenze?mese=YYYY-MM
// Riepilogo mensile presenze per il consulente del lavoro (Elledue).
// Pensato per essere invocato da un'attività esterna (Make/cron) a
// inizio mese per generare la mail delle presenze.
//
// Auth:  header `Authorization: Bearer <PRESENZE_API_TOKEN>`.
//        Senza token valido risponde 401.
// Default mese: se `mese` non è passato, usa il mese precedente nel
//        fuso Europe/Rome (es. chiamata il 1° novembre -> '2026-10').
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

  const mese = (req.query?.mese || '').trim() || mesePrecedenteRoma()
  if (!validaMese(mese)) {
    return res.status(400).json({ error: "Parametro 'mese' non valido, atteso formato YYYY-MM" })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return res.status(500).json({ error: 'Configurazione Supabase mancante sul server' })
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
  const err = dipRes.error || shiftRes.error || leaveRes.error
  if (err) {
    return res.status(500).json({ error: 'Errore query Supabase', dettaglio: err.message })
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
    return res.status(500).json({ error: 'Errore aggregazione', dettaglio: e.message })
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    mese,
    mese_label: meseLabel(mese),
    lavoratori,
    generato_il: new Date().toISOString(),
  })
}
