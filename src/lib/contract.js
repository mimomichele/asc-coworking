// ============================================================
// Helper client per il flusso firma contratto di membership.
//
// Architettura:
//   - fetchContract / fetchUserHasSigned: letture dirette via supabase
//     (RLS le permette: contracts read-all-authenticated; sig own-read).
//   - signContract: invoca la Edge Function sign-contract che esegue
//     atomicamente update members + PDF + upload + insert firma.
//   - fetchLastSignatureForUser / getSignedPdfUrl: usate da SchedaOspite
//     (admin) e dalla scheda del guest per scaricare il PDF firmato.
// ============================================================

import { supabase } from './supabase'

// Carica il testo corrente del contratto (titolo + body con placeholder).
// Serve a mostrarlo nella schermata di firma.
// RLS contracts_read_authenticated permette qualsiasi autenticato.
export async function fetchContract() {
  const { data, error } = await supabase
    .from('contracts')
    .select('title, body')
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[contract.fetchContract]', error)
    return { error: error.message }
  }
  if (!data) return { error: 'Contratto non disponibile' }
  return { data }
}

// Ritorna { hasSigned: boolean } verificando l'esistenza di una firma
// per questo user_id. Usato dal gating in App.jsx.
export async function fetchUserHasSigned(userId) {
  const { data, error } = await supabase
    .from('contract_signatures')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
  if (error) {
    console.error('[contract.fetchUserHasSigned]', error)
    return { hasSigned: false, error: error.message }
  }
  return { hasSigned: (data?.length ?? 0) > 0 }
}

// Firma il contratto via Edge Function. ATOMICO (validate → update
// members → genera PDF → upload Storage → insert firma).
// Ritorna { data: { ok, signature_id, signed_at, pdf_path } } o { error }.
export async function signContract({
  luogo_nascita,
  data_nascita,
  residenza,
  codice_fiscale,
  numero_documento,
}) {
  const { data, error } = await supabase.functions.invoke('sign-contract', {
    body: { luogo_nascita, data_nascita, residenza, codice_fiscale, numero_documento },
  })
  if (error) {
    // Errore di rete / funzione non raggiungibile / 500.
    return { error: error.message || 'Errore di comunicazione con il server' }
  }
  if (data?.error) {
    // Errore gestito ritornato dalla function (validazione, RLS, ecc.).
    return { error: data.error }
  }
  return { data }
}

// Ritorna la firma più recente per questo user_id (o null se mai firmato).
// Usata dal pannello admin (SchedaOspite) per mostrare "Firmato il …".
export async function fetchLastSignatureForUser(userId) {
  const { data, error } = await supabase
    .from('contract_signatures')
    .select('id, signed_at, ip, user_agent, pdf_path')
    .eq('user_id', userId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[contract.fetchLastSignatureForUser]', error)
    return { error: error.message }
  }
  return { data }
}

// Genera un signed URL temporaneo per scaricare un PDF dal bucket
// contract-signatures. La RLS storage.objects decide se il chiamante
// è autorizzato (owner del path o admin).
export async function getSignedPdfUrl(pdfPath, expirySeconds = 60) {
  const { data, error } = await supabase
    .storage
    .from('contract-signatures')
    .createSignedUrl(pdfPath, expirySeconds)
  if (error) {
    console.error('[contract.getSignedPdfUrl]', error)
    return { error: error.message }
  }
  return { url: data?.signedUrl }
}

// ============================================================
// Validazione codice fiscale italiano (lato client, solo UX).
// La Edge Function fa il check minimo (length >= 4 oppure regex);
// qui invece, se l'utente dice di essere italiano, indichiamo
// chiaramente quando il formato non torna.
// ============================================================
export const CF_REGEX = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/

export function validateItalianCF(cf) {
  if (!cf || typeof cf !== 'string') return false
  return CF_REGEX.test(cf.trim().toUpperCase())
}
