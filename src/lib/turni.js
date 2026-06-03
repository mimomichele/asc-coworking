// Helper per il modulo Turni & presenze.
// Lavoriamo sempre con stringhe 'YYYY-MM-DD' (date pure, senza ora) e
// componenti LOCALI: NON usare toISOString(), che converte in UTC e nel
// fuso IT (UTC+1/+2) fa slittare la data. Stessa convenzione di
// RosticceriaPannello.jsx.

export const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
export const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

// Date -> 'YYYY-MM-DD' (componenti locali).
export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Data di oggi come 'YYYY-MM-DD'.
export function oggiStr() {
  return toDateStr(new Date())
}

// Somma n giorni a una stringa data e ritorna una stringa data.
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

// Lunedì della settimana che contiene dateStr (settimana Lun–Dom).
export function lunediDellaSettimana(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  // getDay(): 0=Dom..6=Sab → offset al lunedì
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return toDateStr(d)
}

// Array dei 7 giorni (stringhe data) a partire dal lunedì.
export function giorniSettimana(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))
}

// Range settimana leggibile, es: "2 – 8 giugno 2026" oppure
// "30 giugno – 6 luglio 2026" se a cavallo di due mesi.
export function fmtRangeSettimana(mondayStr) {
  const start = new Date(mondayStr + 'T00:00:00')
  const end = new Date(addDays(mondayStr, 6) + 'T00:00:00')
  const gStart = start.getDate()
  const gEnd = end.getDate()
  const mStart = MESI[start.getMonth()]
  const mEnd = MESI[end.getMonth()]
  const anno = end.getFullYear()
  if (start.getMonth() === end.getMonth()) {
    return `${gStart} – ${gEnd} ${mEnd} ${anno}`
  }
  return `${gStart} ${mStart} – ${gEnd} ${mEnd} ${anno}`
}

// 'HH:MM:SS' o 'HH:MM' -> 'HH:MM'. Robusto a valori già corti.
export function fmtTime(t) {
  if (!t) return ''
  return String(t).slice(0, 5)
}

// Range orario di un turno, es: "08:00–14:00".
export function fmtRangeOrario(start, end) {
  return `${fmtTime(start)}–${fmtTime(end)}`
}

// Nome dipendente compatto per la griglia.
export function nomeDipendente(d) {
  return [d.nome, d.cognome].filter(Boolean).join(' ').trim() || '—'
}

// Iniziali per l'avatar.
export function iniziali(d) {
  const a = (d.nome || '').trim()[0] || ''
  const b = (d.cognome || '').trim()[0] || ''
  return (a + b).toUpperCase() || '?'
}
