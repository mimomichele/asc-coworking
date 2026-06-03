import { supabase } from './supabase'

// Metadati per lo stato calcolato dalla vista v_compliance_scadenziario.
// cls = classe pill esistente; ord = ordine di gravità (per ordinamento).
export const STATO_META = {
  scaduto:        { label: 'Scaduto',        cls: 'pill-alert', ord: 0 },
  in_scadenza:    { label: 'In scadenza',    cls: 'pill-warn',  ord: 1 },
  imminente:      { label: 'Imminente',      cls: 'pill-warn',  ord: 2 },
  in_regola:      { label: 'In regola',      cls: 'pill-ok',    ord: 3 },
  mai_registrato: { label: 'Mai registrato', cls: 'pill-gray',  ord: 4 },
}

export function statoMeta(stato) {
  return STATO_META[stato] || STATO_META.mai_registrato
}

// 'YYYY-MM-DD' -> 'gg/mm/aaaa'
export function fmtData(ds) {
  if (!ds) return '—'
  const [y, m, d] = String(ds).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// € con due decimali, virgola decimale.
export function fmtEuro(n) {
  if (n == null) return '—'
  return '€ ' + Number(n).toFixed(2).replace('.', ',')
}

// Etichetta frequenza in mesi.
export function fmtFrequenza(mesi) {
  if (mesi == null) return 'Ad evento'
  if (mesi === 1) return 'Mensile'
  if (mesi === 3) return 'Trimestrale'
  if (mesi === 6) return 'Semestrale'
  if (mesi === 12) return 'Annuale'
  if (mesi === 24) return 'Biennale'
  if (mesi === 36) return 'Triennale'
  if (mesi === 60) return 'Quinquennale'
  return `Ogni ${mesi} mesi`
}

// Apre in nuova scheda l'allegato del rinnovo (bucket privato, signed url).
export async function apriAllegato(path) {
  if (!path) return { error: 'Nessun allegato' }
  const { data, error } = await supabase.storage.from('compliance-docs').createSignedUrl(path, 60)
  if (error) return { error: error.message }
  window.open(data.signedUrl, '_blank')
  return {}
}
