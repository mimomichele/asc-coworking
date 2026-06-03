// Helper per la gestione delle credenziali di accesso dei dipendenti.
// Richiama la Edge Function 'dipendenti-account', che esegue le
// operazioni privilegiate (createUser / updatePassword / deleteUser +
// profilo + collegamento) lato server con la service role key.
// Specchio di src/lib/adminUsers.js.

import { supabase } from './supabase'

async function callDipendentiAccount(action, payload) {
  const { data, error } = await supabase.functions.invoke('dipendenti-account', {
    body: { action, ...payload },
  })
  if (error) return { error: error.message || 'Errore di comunicazione con il server' }
  if (data?.error) return { error: data.error }
  return { data }
}

// Crea l'accesso per un dipendente. Ritorna { data: { ok, username } } o { error }.
export function createDipendenteCredentials({ dipendente_id, username, codice }) {
  return callDipendentiAccount('create', { dipendente_id, username, codice })
}

// Azzera il codice (password) di un dipendente. Ritorna { data: { ok } } o { error }.
export function resetDipendenteCodice({ dipendente_id, codice }) {
  return callDipendentiAccount('reset-codice', { dipendente_id, codice })
}

// Rimuove l'accesso di un dipendente (elimina utente auth + profilo, scollega).
// Ritorna { data: { ok } } o { error }.
export function revokeDipendenteCredentials({ dipendente_id }) {
  return callDipendentiAccount('revoke', { dipendente_id })
}
