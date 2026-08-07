// ============================================================
// staffetta.js — helper condivisi per la staffetta "Passa l'Acqua"
// (12→13 settembre 2026): schermata guest e pannello admin.
//
// Regola timezone del progetto: per etichette e raggruppamenti si
// usano SOLO getDate/getHours/getMinutes locali, mai toISOString.
// Le scadenze invece sono ISTANTI precisi e si confrontano come tali.
// ============================================================

import { supabase } from './supabase'

// Termine ultimo per le modifiche dei guest: 11 settembre 2026, 10:00
// ora locale. Il costruttore numerico di Date interpreta già in ora
// locale (mese 0-based: 8 = settembre). Oltre questo istante la RLS
// rifiuta il delete dei guest SENZA errore: il frontend deve bloccare
// prima, mai affidarsi al silenzio del DB.
const MODIFICHE_CHIUSE_DA = new Date(2026, 8, 11, 10, 0, 0).getTime()

// Evento concluso: dopo il 13 settembre 2026 la griglia è in sola lettura.
const EVENTO_CONCLUSO_DA = new Date(2026, 8, 14, 0, 0, 0).getTime()

export function modificheChiuse() {
  return Date.now() >= MODIFICHE_CHIUSE_DA
}

export function eventoConcluso() {
  return Date.now() >= EVENTO_CONCLUSO_DA
}

export function fmtOra(d) {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// Carica slot + prenotazioni + nomi. Join lato client: non esiste una
// FK diretta prenotazioni→accounts (entrambe puntano ad auth.users),
// quindi l'embed PostgREST non è disponibile.
// Ritorna gli slot ordinati per inizio, arricchiti:
//   { id, inizio: Date, fine: Date,
//     prenotazione: null | { id, userId, mine, displayName } }
export async function loadStaffetta(currentUserId) {
  const [slotsRes, prenRes] = await Promise.all([
    supabase.from('staffetta_slots').select('id, inizio, fine').order('inizio'),
    supabase.from('staffetta_prenotazioni').select('id, slot_id, user_id, nome_ospite'),
  ])
  if (slotsRes.error) throw slotsRes.error
  if (prenRes.error) throw prenRes.error

  const userIds = [...new Set(prenRes.data.map(p => p.user_id).filter(Boolean))]
  const nomi = {}
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from('accounts')
      .select('owner_id, name, surname')
      .in('owner_id', userIds)
    if (error) throw error
    for (const a of data) nomi[a.owner_id] = `${a.name || ''} ${a.surname || ''}`.trim()
  }

  const bySlot = {}
  for (const p of prenRes.data) {
    bySlot[p.slot_id] = {
      id: p.id,
      userId: p.user_id,
      mine: !!currentUserId && p.user_id === currentUserId,
      displayName: p.user_id ? (nomi[p.user_id] || 'Ospite') : (p.nome_ospite || 'Ospite'),
    }
  }

  return slotsRes.data.map(s => ({
    id: s.id,
    inizio: new Date(s.inizio),
    fine: new Date(s.fine),
    prenotazione: bySlot[s.id] || null,
  }))
}

// Raggruppa gli slot (già ordinati) per ora locale.
// Ritorna [{ key, label, slots }] — ogni gruppo è un'ora con le sue
// (fino a) sei fasce da 10 minuti.
export function groupByHour(slots) {
  const groups = []
  let cur = null
  for (const s of slots) {
    const key = `${s.inizio.getDate()}-${s.inizio.getHours()}`
    if (!cur || cur.key !== key) {
      cur = { key, label: `${String(s.inizio.getHours()).padStart(2, '0')}:00`, slots: [] }
      groups.push(cur)
    }
    cur.slots.push(s)
  }
  return groups
}

// Divide gli slot nei due giorni della UI usando il PRIMO slot come
// riferimento (niente date hardcoded): "primo giorno" = stesso giorno
// locale del primo slot, "secondo giorno" = tutti gli altri.
export function splitByDay(slots) {
  if (slots.length === 0) return { primo: [], secondo: [] }
  const refDay = slots[0].inizio.getDate()
  return {
    primo: slots.filter(s => s.inizio.getDate() === refDay),
    secondo: slots.filter(s => s.inizio.getDate() !== refDay),
  }
}
