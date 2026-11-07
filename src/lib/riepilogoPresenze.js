// Aggregatore mensile delle presenze per il consulente del lavoro (Elledue).
// Logica pura e condivisa tra l'endpoint HTTP (api/presenze.js) e la pagina
// "Riepilogo mese" in /admin/turni/riepilogo.
//
// Convenzioni:
//   - date sempre come stringhe 'YYYY-MM-DD' (locali, mai toISOString)
//   - ore_lavorate: numero decimale di ore (es. 124.5)
//   - un giorno con ferie o malattia approvata NON conteggia ore,
//     anche se nello stesso giorno esiste un turno (coerente con /admin/turni/report)
//   - un turno a cavallo di mezzanotte conta per il giorno in cui inizia:
//     `shifts.data` è la data di inizio, `durataMinuti` tratta end<start come +24h
//   - "permessi" nello schema oggi non esistono: campo sempre a 0.
//   - "contratto" derivato dal flag `a_chiamata`: 'intermittente' | 'dipendente'.

export const MESI_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

// Valida 'YYYY-MM' (01..12, anno a 4 cifre).
export function validaMese(ym) {
  if (typeof ym !== 'string') return false
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return false
  const mese = Number(m[2])
  return mese >= 1 && mese <= 12
}

// 'YYYY-MM' -> 'ottobre 2026'.
export function meseLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${MESI_IT[m - 1]} ${y}`
}

// Mese precedente a quello corrente, letto nel fuso Europe/Rome.
// Esempio: il 1° novembre alle 00:30 italiane → '2026-10'.
export function mesePrecedenteRoma(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit',
  })
  // en-CA restituisce 'YYYY-MM-DD' (o 'YYYY-MM' quando mancano i parti, ma qui è sempre con giorno)
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  let y = Number(parts.year)
  let m = Number(parts.month) - 1
  if (m === 0) { m = 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

// Primo e ultimo giorno del mese 'YYYY-MM' come 'YYYY-MM-DD'.
export function estremiMese(ym) {
  const [y, m] = ym.split('-').map(Number)
  const ultimoGiorno = new Date(Date.UTC(y, m, 0)).getUTCDate() // 28..31
  return {
    primo: `${ym}-01`,
    ultimo: `${ym}-${String(ultimoGiorno).padStart(2, '0')}`,
  }
}

// 'HH:MM[:SS]' -> minuti dalla mezzanotte.
function toMin(t) {
  const [h, m] = String(t || '').split(':')
  return Number(h) * 60 + Number(m || 0)
}

// Minuti di un turno. Se end<start (cavallo di mezzanotte) somma 24h.
export function durataMinutiTurno(start, end) {
  let diff = toMin(end) - toMin(start)
  if (diff < 0) diff += 24 * 60
  return diff
}

// Set delle date 'YYYY-MM-DD' comprese tra aStr e bStr (inclusive), limitate
// al mese di riferimento. Ritorna un Set.
function giorniNelMese(aStr, bStr, primoMese, ultimoMese) {
  const start = aStr < primoMese ? primoMese : aStr
  const end = bStr > ultimoMese ? ultimoMese : bStr
  if (end < start) return new Set()
  const out = new Set()
  // Itero come stringhe per evitare qualunque conversione fuso.
  // start e end sono YYYY-MM-DD; converto a Date UTC solo per incrementare.
  let cur = start
  // Guardia di sicurezza (max 31 giorni).
  for (let i = 0; i < 32 && cur <= end; i++) {
    out.add(cur)
    const [y, m, d] = cur.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    cur = next.toISOString().slice(0, 10)
  }
  return out
}

// Nome esteso del dipendente, trim e fallback a '—'.
function nomeCompleto(d) {
  return [d.nome, d.cognome].filter(Boolean).join(' ').trim() || '—'
}

// Chiave di ordinamento stabile (ordine manuale, poi cognome, poi nome).
function cmpDip(a, b) {
  const oa = a.ordine == null ? Number.POSITIVE_INFINITY : a.ordine
  const ob = b.ordine == null ? Number.POSITIVE_INFINITY : b.ordine
  if (oa !== ob) return oa - ob
  const ca = (a.cognome || '').localeCompare(b.cognome || '', 'it')
  if (ca !== 0) return ca
  return (a.nome || '').localeCompare(b.nome || '', 'it')
}

// Aggregazione principale.
//
// Input:
//   mese: 'YYYY-MM'
//   dipendenti: [{id, nome, cognome, ordine, a_chiamata, attivo, ...}]
//   shifts: [{dipendente_id, data, start_time, end_time}]  — solo del mese
//   leaves: [{dipendente_id, type, start_date, end_date}]  — solo approvate,
//           che si sovrappongono al mese (filtraggio gia' fatto dal chiamante)
//
// Output:
//   [{nome, contratto, giorni_lavorati, ore_lavorate, ferie, malattia, permessi, note}]
//
// Un dipendente senza attività nel mese (zero turni, zero assenze) non compare.
export function calcolaRiepilogo({ mese, dipendenti = [], shifts = [], leaves = [] }) {
  if (!validaMese(mese)) throw new Error(`mese non valido: ${mese}`)
  const { primo, ultimo } = estremiMese(mese)

  // index per lookup O(1)
  const shiftsByDip = new Map()
  for (const s of shifts) {
    if (s.data < primo || s.data > ultimo) continue
    if (!shiftsByDip.has(s.dipendente_id)) shiftsByDip.set(s.dipendente_id, [])
    shiftsByDip.get(s.dipendente_id).push(s)
  }
  const leavesByDip = new Map()
  for (const l of leaves) {
    if (!leavesByDip.has(l.dipendente_id)) leavesByDip.set(l.dipendente_id, [])
    leavesByDip.get(l.dipendente_id).push(l)
  }

  const righe = []
  for (const dip of [...dipendenti].sort(cmpDip)) {
    const dipShifts = shiftsByDip.get(dip.id) || []
    const dipLeaves = leavesByDip.get(dip.id) || []

    const ferie = new Set()
    const malattia = new Set()
    for (const l of dipLeaves) {
      const dates = giorniNelMese(l.start_date, l.end_date, primo, ultimo)
      if (l.type === 'malattia') {
        // Priorità malattia: se un giorno è sia ferie sia malattia, conta come malattia.
        for (const d of dates) { malattia.add(d); ferie.delete(d) }
      } else if (l.type === 'ferie') {
        for (const d of dates) { if (!malattia.has(d)) ferie.add(d) }
      }
    }

    let oreMin = 0
    const giorniLavorati = new Set()
    for (const s of dipShifts) {
      // Giorno con ferie/malattia non conteggia le ore, coerente con /admin/turni/report.
      if (ferie.has(s.data) || malattia.has(s.data)) continue
      oreMin += durataMinutiTurno(s.start_time, s.end_time)
      giorniLavorati.add(s.data)
    }

    if (giorniLavorati.size === 0 && ferie.size === 0 && malattia.size === 0) continue

    righe.push({
      nome: nomeCompleto(dip),
      contratto: dip.a_chiamata ? 'intermittente' : 'dipendente',
      giorni_lavorati: giorniLavorati.size,
      ore_lavorate: Math.round((oreMin / 60) * 100) / 100, // 2 decimali
      ferie: ferie.size,
      malattia: malattia.size,
      permessi: 0,
      note: '',
    })
  }
  return righe
}
