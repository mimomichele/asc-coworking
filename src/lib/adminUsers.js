// Helper per le operazioni admin sugli utenti.
// Richiama la Edge Function 'admin-users', che esegue createUser /
// updateUserById / deleteUser lato server con la service role key.
// La service key NON è più presente nel bundle del browser.
// Sostituisce il vecchio src/lib/supabaseAdmin.js.

import { supabase } from './supabase'

// Ritorna { data } in caso di successo, { error } (stringa) in caso di errore.
async function callAdminUsers(action, payload) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...payload },
  })
  if (error) {
    // Errore di rete / funzione non raggiungibile / 500.
    return { error: error.message || 'Errore di comunicazione con il server' }
  }
  if (data?.error) {
    // Errore gestito restituito dalla funzione (auth, validazione, ecc.).
    return { error: data.error }
  }
  return { data }
}

// Crea un nuovo utente auth. Ritorna { data: { user } } o { error }.
export function adminCreateUser({ email, password, user_metadata }) {
  return callAdminUsers('create', { email, password, user_metadata })
}

// Aggiorna la password di un utente. Ritorna { data: { ok } } o { error }.
export function adminUpdatePassword({ user_id, password }) {
  return callAdminUsers('update-password', { user_id, password })
}

// Elimina un utente auth. Ritorna { data: { ok } } o { error }.
export function adminDeleteUser({ user_id }) {
  return callAdminUsers('delete', { user_id })
}
