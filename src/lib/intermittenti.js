import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Client della Edge Function `intermittenti` (comunicazioni obbligatorie
// per i lavoratori a chiamata). Tutta la logica vive sul server: qui solo
// le chiamate e lo stato per l'interfaccia.

const EVENTO = 'intermittenti-cambiati'

async function call(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('intermittenti', { body: { action, ...extra } })
  if (error) return { error: error.message || 'Errore di rete' }
  return data || { error: 'Risposta vuota' }
}

export const anteprimaIntermittenti = () => call('anteprima')
export const inviaIntermittenti = (impronta) => call('invia', { impronta })

// Da chiamare dopo OGNI scrittura sui turni: manda (se serve) l'avviso
// Telegram e fa ricaricare banner e pallini. Non blocca mai l'interfaccia.
export function turniCambiati() {
  call('notifica').catch(() => {}).finally(() => window.dispatchEvent(new Event(EVENTO)))
}

export function useIntermittenti() {
  const [stato, setStato] = useState(null) // { piano, righeAttive, impronta, oggi, prova, mittente } | { error }
  const ricarica = useCallback(async () => { setStato(await anteprimaIntermittenti()) }, [])
  useEffect(() => {
    ricarica()
    window.addEventListener(EVENTO, ricarica)
    return () => window.removeEventListener(EVENTO, ricarica)
  }, [ricarica])
  return { stato, ricarica }
}

// Stato di una cella (lavoratore, giorno): 'da_comunicare' | 'da_annullare' | 'comunicato' | null
export function statoGiorno(stato, dipendenteId, ds) {
  if (!stato?.piano) return null
  const dentro = r => r.dipendente_id === dipendenteId && ds >= r.data_inizio && ds <= r.data_fine
  if (stato.piano.comunicazioni.some(dentro)) return 'da_comunicare'
  if (stato.piano.annullamenti.some(dentro)) return 'da_annullare'
  if (stato.righeAttive.some(dentro)) return 'comunicato'
  return null
}

export function fmtDataIt(ds) {
  const [y, m, d] = ds.split('-')
  return `${d}/${m}/${y}`
}

export function fmtIntervallo(r) {
  return r.data_inizio === r.data_fine ? fmtDataIt(r.data_inizio) : `${fmtDataIt(r.data_inizio)} → ${fmtDataIt(r.data_fine)}`
}
