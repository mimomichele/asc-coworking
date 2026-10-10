// Lavoratori intermittenti (contratto a chiamata): lato client.
// La logica pura (raggruppamento date, XML, validazioni) sta in
// supabase/functions/_shared/intermittenti.js, condivisa con la Edge
// Function invia-intermittenti; qui solo accesso a DB e funzione.

import { supabase } from './supabase'

export {
  COSTANTI, raggruppaGiorni, spezzaInvii, pianificaComunicazioni, turniUrgenti,
  validaCodiceFiscale, validaCodiceComunicazione, normalizzaCodice,
  generaXml, fmtDataIt, fmtRigaDate, nomeLavoratore,
} from '../../supabase/functions/_shared/intermittenti.js'

// Etichette e colori degli stati (badge sui turni).
export const STATI_COM = {
  da_comunicare: { label: 'Da comunicare', colore: '#854F0B', bg: '#FAEEDA' },
  comunicato:    { label: 'Comunicato',    colore: '#1E8E3E', bg: '#EAF3DE' },
  da_annullare:  { label: 'Da annullare',  colore: '#C5221F', bg: '#FCEBEB' },
  annullato:     { label: 'Annullato',     colore: '#666',    bg: '#f1efea' },
}

// Tutto cio' che e' in attesa di invio: lavoratori a chiamata, turni da
// comunicare (da oggi in poi: le giornate passate non si possono piu'
// comunicare, ma restano visibili col badge) e annullamenti da inviare.
export async function caricaPendenti() {
  const [dipRes, shiftRes, annRes] = await Promise.all([
    supabase.from('dipendenti').select('*').eq('a_chiamata', true),
    supabase.from('shifts').select('*').eq('com_stato', 'da_comunicare').order('data'),
    supabase.from('intermittenti_annullamenti').select('*').eq('stato', 'da_inviare').order('inizio'),
  ])
  const error = dipRes.error || shiftRes.error || annRes.error
  return {
    error: error ? error.message : null,
    dipendenti: dipRes.data || [],
    shifts: shiftRes.data || [],
    annullamenti: annRes.data || [],
  }
}

// Conteggio rapido per il pulsante del planner.
export async function contaPendenti() {
  const [s, a] = await Promise.all([
    supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('com_stato', 'da_comunicare'),
    supabase.from('intermittenti_annullamenti').select('id', { count: 'exact', head: true }).eq('stato', 'da_inviare'),
  ])
  return (s.count || 0) + (a.count || 0)
}

async function chiama(body) {
  const { data, error } = await supabase.functions.invoke('invia-intermittenti', { body })
  if (error) return { error: error.message || 'Errore di comunicazione con il server' }
  if (data?.error) return { error: data.error }
  return { data }
}

// righe: [{ dipendente_id, inizio, fine }] (max 10)
export function inviaComunicazione(righe) {
  return chiama({ tipo: 'comunicazione', righe: righe.map(r => ({ dipendente_id: r.dipendente_id, inizio: r.inizio, fine: r.fine })) })
}

// ids: id di intermittenti_annullamenti (max 10)
export function inviaAnnullamento(ids) {
  return chiama({ tipo: 'annullamento', ids })
}

// Scarica un XML dal registro come file.
export function scaricaXml(xml, nome = 'moduloIntermittenti.xml') {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
