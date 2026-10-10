import { describe, it, expect } from 'vitest'
import {
  raggruppaGiorni, calcolaPiano, generaXml, aBlocchi, giorniTra, improntaPiano,
} from '../supabase/functions/_shared/intermittenti.ts'

const LAV = { id: 'a', nome: 'Anna Rossi', codice_fiscale: 'rssnna90a41a390x', codice_comunicazione: '1700026201104147', a_chiamata_dal: null }
const OGGI = '2026-11-01'

describe('raggruppaGiorni', () => {
  it('giorni continuativi = una riga', () => {
    expect(raggruppaGiorni(giorniTra('2026-11-01', '2026-11-10')))
      .toEqual([{ data_inizio: '2026-11-01', data_fine: '2026-11-10' }])
  })
  it('giorni staccati = una riga per giorno', () => {
    expect(raggruppaGiorni(['2026-11-12', '2026-11-03', '2026-11-07'])).toEqual([
      { data_inizio: '2026-11-03', data_fine: '2026-11-03' },
      { data_inizio: '2026-11-07', data_fine: '2026-11-07' },
      { data_inizio: '2026-11-12', data_fine: '2026-11-12' },
    ])
  })
  it('a cavallo di mese e di anno', () => {
    expect(raggruppaGiorni(['2026-11-30', '2026-12-01', '2026-12-31', '2027-01-01'])).toEqual([
      { data_inizio: '2026-11-30', data_fine: '2026-12-01' },
      { data_inizio: '2026-12-31', data_fine: '2027-01-01' },
    ])
  })
  it('doppioni (turno spezzato) contano una volta', () => {
    expect(raggruppaGiorni(['2026-11-03', '2026-11-03'])).toHaveLength(1)
  })
  it('spezza le righe oltre 30 giorni', () => {
    const r = raggruppaGiorni(giorniTra('2026-11-01', '2026-12-05'))
    expect(r).toEqual([
      { data_inizio: '2026-11-01', data_fine: '2026-11-30' },
      { data_inizio: '2026-12-01', data_fine: '2026-12-05' },
    ])
  })
})

describe('calcolaPiano', () => {
  it('turni nuovi -> da comunicare, passato ignorato', () => {
    const p = calcolaPiano([LAV], { a: ['2026-10-30', '2026-11-01', '2026-11-02', '2026-11-05'] }, [], OGGI)
    expect(p.annullamenti).toEqual([])
    expect(p.comunicazioni.map(r => [r.data_inizio, r.data_fine, r.urgente])).toEqual([
      ['2026-11-01', '2026-11-02', true],
      ['2026-11-05', '2026-11-05', false],
    ])
  })
  it('rispetta "a chiamata dal"', () => {
    const p = calcolaPiano([{ ...LAV, a_chiamata_dal: '2026-11-04' }], { a: ['2026-11-02', '2026-11-05'] }, [], OGGI)
    expect(p.comunicazioni.map(r => r.data_inizio)).toEqual(['2026-11-05'])
  })
  it('giorni gia comunicati non si ricomunicano', () => {
    const righe = [{ id: 'r1', dipendente_id: 'a', data_inizio: '2026-11-03', data_fine: '2026-11-04' }]
    const p = calcolaPiano([LAV], { a: ['2026-11-03', '2026-11-04', '2026-11-05'] }, righe, OGGI)
    expect(p.annullamenti).toEqual([])
    expect(p.comunicazioni.map(r => [r.data_inizio, r.data_fine])).toEqual([['2026-11-05', '2026-11-05']])
  })
  it('turno tolto da una riga: annulla la riga intera e ricomunica il resto', () => {
    const righe = [{ id: 'r1', dipendente_id: 'a', data_inizio: '2026-11-01', data_fine: '2026-11-10' }]
    const turni = giorniTra('2026-11-01', '2026-11-10').filter(g => g !== '2026-11-05')
    const p = calcolaPiano([LAV], { a: turni }, righe, OGGI)
    expect(p.annullamenti.map(r => r.id)).toEqual(['r1'])
    expect(p.comunicazioni.map(r => [r.data_inizio, r.data_fine, r.sostituisce])).toEqual([
      ['2026-11-01', '2026-11-04', true],
      ['2026-11-06', '2026-11-10', true],
    ])
  })
  it('turno cancellato del tutto: solo annullamento', () => {
    const righe = [{ id: 'r1', dipendente_id: 'a', data_inizio: '2026-11-07', data_fine: '2026-11-07' }]
    const p = calcolaPiano([LAV], { a: [] }, righe, OGGI)
    expect(p.annullamenti).toHaveLength(1)
    expect(p.comunicazioni).toEqual([])
  })
  it('righe concluse nel passato non si toccano', () => {
    const righe = [{ id: 'r1', dipendente_id: 'a', data_inizio: '2026-10-20', data_fine: '2026-10-22' }]
    const p = calcolaPiano([LAV], { a: [] }, righe, OGGI)
    expect(p).toEqual({ comunicazioni: [], annullamenti: [] })
  })
  it('riga gia iniziata e poi modificata viene segnalata', () => {
    const righe = [{ id: 'r1', dipendente_id: 'a', data_inizio: '2026-10-30', data_fine: '2026-11-03' }]
    const p = calcolaPiano([LAV], { a: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03'] }, righe, OGGI)
    expect(p.annullamenti[0].gia_iniziata).toBe(true)
    expect(p.comunicazioni.map(r => [r.data_inizio, r.data_fine])).toEqual([
      ['2026-10-30', '2026-11-01'], ['2026-11-03', '2026-11-03'],
    ])
  })
  it('impronta stabile e sensibile ai cambi', () => {
    const p1 = calcolaPiano([LAV], { a: ['2026-11-05'] }, [], OGGI)
    const p2 = calcolaPiano([LAV], { a: ['2026-11-05'] }, [], OGGI)
    const p3 = calcolaPiano([LAV], { a: ['2026-11-06'] }, [], OGGI)
    expect(improntaPiano(p1)).toBe(improntaPiano(p2))
    expect(improntaPiano(p1)).not.toBe(improntaPiano(p3))
  })
})

describe('generaXml', () => {
  const riga = { codice_fiscale: 'rssnna90a41a390x', codice_comunicazione: '1700026201104147', data_inizio: '2026-11-01', data_fine: '2026-11-10' }
  it('struttura del modulo ML-15-01', () => {
    const x = generaXml([riga], { emailDatore: 'amministrazione@aschotel.com', annullamento: false })
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?><moduloIntermittenti><Campi><CFdatorelavoro>02044450514</CFdatorelavoro>')).toBe(true)
    expect(x).toContain('<BCbarcodeModello01>ML-15-01</BCbarcodeModello01><BCbarcodeModello01>ML-15-01</BCbarcodeModello01>')
    expect(x).toContain('<EMmail>amministrazione@aschotel.com</EMmail><ANannullamento>0</ANannullamento>')
    expect(x).toContain('<CFlavoratore1>RSSNNA90A41A390X</CFlavoratore1><CCcodcomunicazione1>1700026201104147</CCcodcomunicazione1><DTdatainizio1>01/11/2026</DTdatainizio1><DTdatafine1>10/11/2026</DTdatafine1>')
    expect(x).toContain('<CFlavoratore2/><CCcodcomunicazione2/><DTdatainizio2/><DTdatafine2/>')
    expect(x.endsWith('<DTdatafine10/></Campi></moduloIntermittenti>')).toBe(true)
    expect((x.match(/<CFlavoratore\d+/g) || []).length).toBe(10)
  })
  it('annullamento', () => {
    expect(generaXml([riga], { emailDatore: 'a@b.it', annullamento: true })).toContain('<ANannullamento>1</ANannullamento>')
  })
  it('rifiuta piu di 10 righe e zero righe', () => {
    expect(() => generaXml(Array(11).fill(riga), { emailDatore: 'a@b.it', annullamento: false })).toThrow()
    expect(() => generaXml([], { emailDatore: 'a@b.it', annullamento: false })).toThrow()
  })
  it('piu di 10 righe = piu moduli', () => {
    expect(aBlocchi(Array(23).fill(riga)).map(b => b.length)).toEqual([10, 10, 3])
  })
})
