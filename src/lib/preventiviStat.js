// ============================================================
// Preventivi > Statistiche — logica pura di aggregazione.
//
// Nessuna dipendenza da React o Supabase, cosi' si testa con
// vitest. Le date sono calendario Europe/Rome: data_ricevuta e'
// timestamptz e la reception ragiona in ore italiane.
// ============================================================

import { motivoLabel } from './preventivi'

const FMT_ROMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
})

// timestamptz ISO → 'YYYY-MM-DD' nel fuso Europe/Rome.
export function giornoRoma(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return FMT_ROMA.format(d)
}

export function oggiRoma(now = new Date()) { return FMT_ROMA.format(now) }

// 'YYYY-MM-DD' spostato di n giorni (aritmetica UTC: niente DST).
export function spostaGiorni(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}

export const PRESET = [
  { key: 'mese',      label: 'Questo mese' },
  { key: '30',        label: 'Ultimi 30 gg' },
  { key: '90',        label: 'Ultimi 90 gg' },
  { key: 'anno',      label: 'Anno in corso' },
  { key: 'anno_prec', label: 'Anno scorso' },
  { key: 'tutto',     label: 'Tutto' },
]

// Intervallo { da, a } ('YYYY-MM-DD', '' = estremo aperto) di un preset.
export function intervalloPreset(key, oggi = oggiRoma()) {
  const anno = Number(oggi.slice(0, 4))
  switch (key) {
    case 'mese':      return { da: oggi.slice(0, 7) + '-01', a: oggi }
    case '30':        return { da: spostaGiorni(oggi, -30), a: oggi }
    case '90':        return { da: spostaGiorni(oggi, -90), a: oggi }
    case 'anno':      return { da: `${anno}-01-01`, a: oggi }
    case 'anno_prec': return { da: `${anno - 1}-01-01`, a: `${anno - 1}-12-31` }
    default:          return { da: '', a: '' }
  }
}

export const STATI_APERTI = ['ricevuta', 'inviato', 'attesa']
export const STATI_CHIUSI = ['confermata', 'persa', 'scaduta']

// Esito usato nei grafici: confermata | persa | scaduta | aperta.
export function esito(stato) {
  return STATI_CHIUSI.includes(stato) ? stato : 'aperta'
}

export function filtraPeriodo(righe, { da, a }) {
  return righe.filter(r => {
    const g = giornoRoma(r.data_ricevuta)
    if (!g) return false
    if (da && g < da) return false
    if (a && g > a) return false
    return true
  })
}

// Confermate / (confermate + perse + scadute). null senza chiuse.
export function tassoConversione(confermate, chiuse) {
  return chiuse > 0 ? confermate / chiuse : null
}

export function kpi(righe) {
  const conf = righe.filter(r => r.stato === 'confermata')
  const perse = righe.filter(r => r.stato === 'persa').length
  const scadute = righe.filter(r => r.stato === 'scaduta').length
  const chiuse = conf.length + perse + scadute

  const confConImporto = conf.filter(r => r.importo_preventivo != null && r.importo_preventivo !== '')
  const importoConfermato = confConImporto.reduce((s, r) => s + Number(r.importo_preventivo), 0)

  const aperte = righe.filter(r => STATI_APERTI.includes(r.stato))
  const importoSospeso = aperte.reduce((s, r) => s + Number(r.importo_preventivo || 0), 0)

  // Tempo alla prima risposta = data_invio − data_ricevuta, in ore,
  // media sulle richieste che hanno entrambe le date.
  const ore = righe
    .filter(r => r.data_invio && r.data_ricevuta)
    .map(r => (new Date(r.data_invio) - new Date(r.data_ricevuta)) / 3_600_000)
    .filter(h => isFinite(h) && h >= 0)
  const oreRisposta = ore.length ? ore.reduce((s, h) => s + h, 0) / ore.length : null

  return {
    ricevute: righe.length,
    confermate: conf.length, perse, scadute, chiuse,
    conversione: tassoConversione(conf.length, chiuse),
    importoConfermato,
    importoMedio: confConImporto.length ? importoConfermato / confConImporto.length : null,
    oreRisposta, nRisposte: ore.length,
    aperte: aperte.length, importoSospeso,
  }
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

// 'YYYY-MM' → 'ott 26'
export function etichettaMese(ym) {
  const [y, m] = ym.split('-')
  return `${MESI[Number(m) - 1]} ${y.slice(2)}`
}

const esitiVuoti = () => ({ confermata: 0, persa: 0, scaduta: 0, aperta: 0 })

// Richieste per mese di ricezione, impilate per esito. Riempie i mesi
// senza richieste tra `da` e `a`; se un estremo e' aperto usa la prima
// o l'ultima richiesta presente.
export function perMese(righe, { da = '', a = '' } = {}) {
  const map = new Map()
  let min = da ? da.slice(0, 7) : null
  let max = a ? a.slice(0, 7) : null
  for (const r of righe) {
    const g = giornoRoma(r.data_ricevuta)
    if (!g) continue
    const ym = g.slice(0, 7)
    if (!map.has(ym)) map.set(ym, esitiVuoti())
    map.get(ym)[esito(r.stato)]++
    if (!min || ym < min) min = ym
    if (!max || ym > max) max = ym
  }
  if (min && max) {
    let [y, m] = min.split('-').map(Number)
    const [ey, em] = max.split('-').map(Number)
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, esitiVuoti())
      m++
      if (m > 12) { m = 1; y++ }
    }
  }
  return [...map.entries()]
    .sort(([x], [z]) => x.localeCompare(z))
    .map(([ym, v]) => ({
      ym, label: etichettaMese(ym), ...v,
      totale: v.confermata + v.persa + v.scaduta + v.aperta,
    }))
}

// Conteggio + conversione per valore di `campo` (tipologia, canale).
// `elenco` da' le label ([{ key, label }]); valori ignoti restano key.
export function perCategoria(righe, campo, elenco) {
  const map = new Map()
  for (const r of righe) {
    const k = r[campo] || 'altro'
    if (!map.has(k)) map.set(k, { key: k, ...esitiVuoti() })
    map.get(k)[esito(r.stato)]++
  }
  return [...map.values()]
    .map(v => {
      const chiuse = v.confermata + v.persa + v.scaduta
      return {
        ...v,
        label: elenco.find(e => e.key === v.key)?.label ?? v.key,
        totale: chiuse + v.aperta,
        conversione: tassoConversione(v.confermata, chiuse),
      }
    })
    .sort((x, z) => z.totale - x.totale)
}

export function motiviPerdita(righe) {
  const map = new Map()
  for (const r of righe) {
    if (r.stato !== 'persa') continue
    const k = r.motivo_perdita || 'altro'
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, label: motivoLabel(key), n }))
    .sort((x, z) => z.n - x.n)
}

// Confermate con arrivo da oggi in poi, in ordine di arrivo.
export function prossimiArrivi(righe, oggi = oggiRoma()) {
  return righe
    .filter(r => r.stato === 'confermata' && r.data_arrivo && r.data_arrivo >= oggi)
    .sort((x, z) => x.data_arrivo.localeCompare(z.data_arrivo))
}

// Ore → '45 min' | '3,5 h' | '2,1 gg'
export function fmtDurata(ore) {
  if (ore == null || !isFinite(ore)) return '—'
  if (ore < 1) return `${Math.round(ore * 60)} min`
  if (ore < 48) return `${ore.toLocaleString('it-IT', { maximumFractionDigits: 1 })} h`
  return `${(ore / 24).toLocaleString('it-IT', { maximumFractionDigits: 1 })} gg`
}

export function fmtPct(x) {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}
