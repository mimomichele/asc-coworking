import { describe, it, expect } from 'vitest'
import {
  giornoRoma, spostaGiorni, intervalloPreset, filtraPeriodo, kpi, perMese,
  perCategoria, motiviPerdita, prossimiArrivi, fmtDurata, fmtPct,
} from '../src/lib/preventiviStat.js'
import { TIPOLOGIE, CANALI } from '../src/lib/preventivi.js'

const r = (o) => ({
  stato: 'ricevuta', tipologia: 'raduno', canale: 'email',
  data_ricevuta: '2026-06-10T10:00:00Z', importo_preventivo: null, ...o,
})

describe('date Europe/Rome', () => {
  it('giornoRoma usa il calendario italiano, non UTC', () => {
    expect(giornoRoma('2026-06-30T22:30:00Z')).toBe('2026-07-01')   // CEST
    expect(giornoRoma('2026-01-31T23:30:00Z')).toBe('2026-02-01')   // CET
    expect(giornoRoma(null)).toBeNull()
  })
  it('spostaGiorni attraversa mese e anno', () => {
    expect(spostaGiorni('2026-03-01', -1)).toBe('2026-02-28')
    expect(spostaGiorni('2026-01-05', -30)).toBe('2025-12-06')
  })
  it('intervalloPreset', () => {
    const oggi = '2026-10-30'
    expect(intervalloPreset('mese', oggi)).toEqual({ da: '2026-10-01', a: oggi })
    expect(intervalloPreset('30', oggi)).toEqual({ da: '2026-09-30', a: oggi })
    expect(intervalloPreset('anno', oggi)).toEqual({ da: '2026-01-01', a: oggi })
    expect(intervalloPreset('anno_prec', oggi)).toEqual({ da: '2025-01-01', a: '2025-12-31' })
    expect(intervalloPreset('tutto', oggi)).toEqual({ da: '', a: '' })
  })
  it('filtraPeriodo e\' inclusivo e tollera estremi aperti', () => {
    const righe = [
      r({ id: 1, data_ricevuta: '2026-05-31T23:00:00Z' }), // 1 giugno a Roma
      r({ id: 2, data_ricevuta: '2026-06-15T10:00:00Z' }),
      r({ id: 3, data_ricevuta: '2026-07-01T05:00:00Z' }),
    ]
    expect(filtraPeriodo(righe, { da: '2026-06-01', a: '2026-06-30' }).map(x => x.id)).toEqual([1, 2])
    expect(filtraPeriodo(righe, { da: '', a: '2026-06-01' }).map(x => x.id)).toEqual([1])
    expect(filtraPeriodo(righe, { da: '', a: '' })).toHaveLength(3)
  })
})

describe('kpi', () => {
  const righe = [
    r({ stato: 'confermata', importo_preventivo: '1000.00', data_invio: '2026-06-11T10:00:00Z' }), // 24h
    r({ stato: 'confermata', importo_preventivo: 3000, data_invio: '2026-06-10T12:00:00Z' }),      // 2h
    r({ stato: 'confermata', importo_preventivo: null }),
    r({ stato: 'persa', motivo_perdita: 'prezzo', importo_preventivo: 500 }),
    r({ stato: 'scaduta' }),
    r({ stato: 'inviato', importo_preventivo: 700, data_invio: '2026-06-10T10:30:00Z' }),          // 0.5h
    r({ stato: 'attesa', importo_preventivo: 300 }),
    r({ stato: 'ricevuta' }),
  ]
  const k = kpi(righe)
  it('conteggi e conversione', () => {
    expect(k.ricevute).toBe(8)
    expect(k.confermate).toBe(3)
    expect(k.perse).toBe(1)
    expect(k.scadute).toBe(1)
    expect(k.chiuse).toBe(5)
    expect(k.conversione).toBeCloseTo(0.6)
  })
  it('importi: confermato totale, media solo su chi ha importo, sospeso su aperte', () => {
    expect(k.importoConfermato).toBe(4000)
    expect(k.importoMedio).toBe(2000)
    expect(k.aperte).toBe(3)
    expect(k.importoSospeso).toBe(1000)
  })
  it('tempo medio alla prima risposta in ore', () => {
    expect(k.nRisposte).toBe(3)
    expect(k.oreRisposta).toBeCloseTo((24 + 2 + 0.5) / 3)
  })
  it('vuoto: niente divisioni per zero', () => {
    const z = kpi([])
    expect(z.conversione).toBeNull()
    expect(z.importoMedio).toBeNull()
    expect(z.oreRisposta).toBeNull()
    expect(z.importoConfermato).toBe(0)
  })
})

describe('perMese', () => {
  it('impila per esito e riempie i mesi vuoti del periodo', () => {
    const righe = [
      r({ stato: 'confermata', data_ricevuta: '2026-03-05T10:00:00Z' }),
      r({ stato: 'persa', data_ricevuta: '2026-03-20T10:00:00Z' }),
      r({ stato: 'inviato', data_ricevuta: '2026-05-02T10:00:00Z' }),
    ]
    const m = perMese(righe, { da: '2026-02-01', a: '2026-05-31' })
    expect(m.map(x => x.ym)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05'])
    expect(m[1]).toMatchObject({ label: 'mar 26', confermata: 1, persa: 1, scaduta: 0, aperta: 0, totale: 2 })
    expect(m[3]).toMatchObject({ aperta: 1, totale: 1 })
  })
  it('con estremi aperti usa prima e ultima richiesta', () => {
    const righe = [
      r({ data_ricevuta: '2025-11-10T10:00:00Z' }),
      r({ data_ricevuta: '2026-01-10T10:00:00Z' }),
    ]
    expect(perMese(righe, { da: '', a: '' }).map(x => x.ym)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('senza righe e senza periodo: vuoto', () => {
    expect(perMese([], {})).toEqual([])
  })
})

describe('perCategoria / motivi / arrivi', () => {
  it('perCategoria conta e calcola la conversione per chiave', () => {
    const righe = [
      r({ tipologia: 'scuola', stato: 'confermata' }),
      r({ tipologia: 'scuola', stato: 'persa' }),
      r({ tipologia: 'scuola', stato: 'ricevuta' }),
      r({ tipologia: 'raduno', stato: 'attesa' }),
    ]
    const t = perCategoria(righe, 'tipologia', TIPOLOGIE)
    expect(t[0]).toMatchObject({ key: 'scuola', totale: 3, confermata: 1, persa: 1, aperta: 1, conversione: 0.5 })
    expect(t[0].label).toBe('Gruppo scolastico / scambio')
    expect(t[1]).toMatchObject({ key: 'raduno', totale: 1, conversione: null })
    const c = perCategoria(righe, 'canale', CANALI)
    expect(c).toHaveLength(1)
    expect(c[0].label).toBe('Email')
  })
  it('motiviPerdita usa le label di MOTIVI_PERDITA e ordina per frequenza', () => {
    const righe = [
      r({ stato: 'persa', motivo_perdita: 'prezzo' }),
      r({ stato: 'persa', motivo_perdita: 'scelto_altro' }),
      r({ stato: 'persa', motivo_perdita: 'scelto_altro' }),
      r({ stato: 'persa', motivo_perdita: null }),
      r({ stato: 'confermata', motivo_perdita: 'prezzo' }),
    ]
    expect(motiviPerdita(righe)).toEqual([
      { key: 'scelto_altro', label: 'Ha scelto altra struttura', n: 2 },
      { key: 'prezzo', label: 'Prezzo', n: 1 },
      { key: 'altro', label: 'Altro', n: 1 },
    ])
  })
  it('prossimiArrivi: solo confermate da oggi in poi, ordinate', () => {
    const righe = [
      r({ id: 'a', stato: 'confermata', data_arrivo: '2026-12-01' }),
      r({ id: 'b', stato: 'confermata', data_arrivo: '2026-10-30' }),
      r({ id: 'c', stato: 'confermata', data_arrivo: '2026-10-29' }),
      r({ id: 'd', stato: 'inviato', data_arrivo: '2026-11-15' }),
      r({ id: 'e', stato: 'confermata', data_arrivo: null }),
    ]
    expect(prossimiArrivi(righe, '2026-10-30').map(x => x.id)).toEqual(['b', 'a'])
  })
})

describe('formattazione', () => {
  it('fmtDurata', () => {
    expect(fmtDurata(null)).toBe('—')
    expect(fmtDurata(0.5)).toBe('30 min')
    expect(fmtDurata(3.456)).toBe('3,5 h')
    expect(fmtDurata(72)).toBe('3 gg')
  })
  it('fmtPct', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(0.666)).toBe('67%')
  })
})
