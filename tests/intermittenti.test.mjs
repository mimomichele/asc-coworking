// Test della logica pura dei lavoratori intermittenti.
// Esecuzione: npm test  (node --test, nessuna dipendenza).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  raggruppaGiorni, spezzaInvii, pianificaComunicazioni, generaXml,
  turniUrgenti, validaCodiceFiscale, validaCodiceComunicazione, COSTANTI,
} from '../supabase/functions/_shared/intermittenti.js'

const MARIO = { id: 'm', nome: 'Mario', cognome: 'Rossi', a_chiamata: true, codice_fiscale: 'RSSMRA80A01A390X', codice_comunicazione: '1234567890123456' }
const ANNA = { id: 'a', nome: 'Anna', cognome: 'Bianchi', a_chiamata: true, codice_fiscale: 'BNCNNA85B41A390Y', codice_comunicazione: 'ABCDEFGHIJKLMNOP' }
const LUCA = { id: 'l', nome: 'Luca', cognome: 'Verdi', a_chiamata: false }

let n = 0
const turno = (dip, data, stato = 'da_comunicare', start = '08:00:00') =>
  ({ id: 's' + (++n), dipendente_id: dip, data, start_time: start, end_time: '14:00:00', com_stato: stato })

test('giorni consecutivi -> una riga inizio/fine', () => {
  assert.deepEqual(raggruppaGiorni(['2026-10-12', '2026-10-13', '2026-10-14']), [{ inizio: '2026-10-12', fine: '2026-10-14' }])
})

test('giorni staccati -> una riga per giorno con inizio = fine', () => {
  assert.deepEqual(raggruppaGiorni(['2026-10-12', '2026-10-14', '2026-10-17']), [
    { inizio: '2026-10-12', fine: '2026-10-12' },
    { inizio: '2026-10-14', fine: '2026-10-14' },
    { inizio: '2026-10-17', fine: '2026-10-17' },
  ])
})

test('misto, in disordine e con doppioni (turno spezzato)', () => {
  assert.deepEqual(raggruppaGiorni(['2026-10-14', '2026-10-12', '2026-10-13', '2026-10-13', '2026-10-20']), [
    { inizio: '2026-10-12', fine: '2026-10-14' },
    { inizio: '2026-10-20', fine: '2026-10-20' },
  ])
})

test('consecutivi a cavallo di mese e di anno', () => {
  assert.deepEqual(raggruppaGiorni(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']), [{ inizio: '2026-10-30', fine: '2026-11-02' }])
  assert.deepEqual(raggruppaGiorni(['2026-12-31', '2027-01-01']), [{ inizio: '2026-12-31', fine: '2027-01-01' }])
  assert.deepEqual(raggruppaGiorni(['2028-02-28', '2028-02-29', '2028-03-01']), [{ inizio: '2028-02-28', fine: '2028-03-01' }])
})

test('piu di 10 righe -> piu invii', () => {
  const righe = Array.from({ length: 23 }, (_, i) => ({ inizio: 'x' + i, fine: 'x' + i }))
  const invii = spezzaInvii(righe)
  assert.equal(invii.length, 3)
  assert.deepEqual(invii.map(i => i.length), [10, 10, 3])
  assert.deepEqual(spezzaInvii([]), [])
})

test('pianificazione: solo lavoratori a chiamata e turni da comunicare, ordinati per nome', () => {
  const shifts = [
    turno('m', '2026-10-13'), turno('m', '2026-10-12'), turno('m', '2026-10-12', 'da_comunicare', '16:00:00'),
    turno('m', '2026-10-15'), turno('m', '2026-10-16', 'comunicato'),
    turno('a', '2026-10-12'), turno('l', '2026-10-12'),
    turno('m', '2026-10-20', null),
  ]
  const righe = pianificaComunicazioni(shifts, [MARIO, ANNA, LUCA])
  assert.deepEqual(righe.map(r => [r.nome, r.inizio, r.fine, r.giorni, r.shift_ids.length]), [
    ['Anna Bianchi', '2026-10-12', '2026-10-12', 1, 1],
    ['Mario Rossi', '2026-10-12', '2026-10-13', 2, 3],
    ['Mario Rossi', '2026-10-15', '2026-10-15', 1, 1],
  ])
  assert.equal(righe[1].codice_fiscale, MARIO.codice_fiscale)
})

test('urgenti: da comunicare che iniziano entro 24 ore o gia iniziati', () => {
  const adesso = new Date('2026-10-12T10:00:00')
  const shifts = [
    turno('m', '2026-10-12', 'da_comunicare', '09:00:00'), // gia' iniziato
    turno('m', '2026-10-13', 'da_comunicare', '09:00:00'), // tra 23 ore
    turno('m', '2026-10-13', 'da_comunicare', '11:00:00'), // tra 25 ore
    turno('m', '2026-10-13', 'comunicato', '09:00:00'),
    turno('l', '2026-10-12', 'da_comunicare', '12:00:00'),
  ]
  const u = turniUrgenti(shifts, [MARIO, LUCA], adesso)
  assert.deepEqual(u.map(s => s.data + ' ' + s.start_time), ['2026-10-12 09:00:00', '2026-10-13 09:00:00'])
})

test('validazione codici', () => {
  assert.equal(validaCodiceFiscale('rssmra80a01a390x'), true)
  assert.equal(validaCodiceFiscale('RSSMRA80A01A390'), false)
  assert.equal(validaCodiceComunicazione('1234567890123456'), true)
  assert.equal(validaCodiceComunicazione('12345'), false)
})

test('XML: struttura ML-15-01 con due righe e otto vuote', () => {
  const xml = generaXml({
    righe: [
      { codice_fiscale: MARIO.codice_fiscale, codice_comunicazione: MARIO.codice_comunicazione, inizio: '2026-10-12', fine: '2026-10-14' },
      { codice_fiscale: ANNA.codice_fiscale, codice_comunicazione: ANNA.codice_comunicazione, inizio: '2026-10-20', fine: '2026-10-20' },
    ],
  })
  const atteso = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<moduloIntermittenti>',
    '  <Campi>',
    '    <CFdatorelavoro>02044450514</CFdatorelavoro>',
    '    <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>',
    '    <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>',
    '    <EMmail>amministrazione@aschotel.com</EMmail>',
    '    <ANannullamento>0</ANannullamento>',
    '    <CFlavoratore1>RSSMRA80A01A390X</CFlavoratore1>',
    '    <CCcodcomunicazione1>1234567890123456</CCcodcomunicazione1>',
    '    <DTdatainizio1>2026-10-12</DTdatainizio1>',
    '    <DTdatafine1>2026-10-14</DTdatafine1>',
    '    <CFlavoratore2>BNCNNA85B41A390Y</CFlavoratore2>',
    '    <CCcodcomunicazione2>ABCDEFGHIJKLMNOP</CCcodcomunicazione2>',
    '    <DTdatainizio2>2026-10-20</DTdatainizio2>',
    '    <DTdatafine2>2026-10-20</DTdatafine2>',
    ...[3, 4, 5, 6, 7, 8, 9, 10].flatMap(i => [
      `    <CFlavoratore${i}/>`, `    <CCcodcomunicazione${i}/>`, `    <DTdatainizio${i}/>`, `    <DTdatafine${i}/>`,
    ]),
    '  </Campi>',
    '</moduloIntermittenti>',
    '',
  ].join('\n')
  assert.equal(xml, atteso)
})

test('XML: annullamento con ANannullamento = 1', () => {
  const xml = generaXml({ annullamento: true, righe: [{ codice_fiscale: MARIO.codice_fiscale, codice_comunicazione: MARIO.codice_comunicazione, inizio: '2026-10-12', fine: '2026-10-14' }] })
  assert.match(xml, /<ANannullamento>1<\/ANannullamento>/)
  assert.match(xml, /<DTdatainizio1>2026-10-12<\/DTdatainizio1>\n\s*<DTdatafine1>2026-10-14<\/DTdatafine1>/)
})

test('XML: rifiuta zero righe, piu di 10 righe e righe incomplete', () => {
  assert.throws(() => generaXml({ righe: [] }))
  const r = { codice_fiscale: 'X', codice_comunicazione: 'Y', inizio: '2026-01-01', fine: '2026-01-01' }
  assert.throws(() => generaXml({ righe: Array(11).fill(r) }), /Massimo 10/)
  assert.throws(() => generaXml({ righe: [{ codice_fiscale: 'X', inizio: '2026-01-01', fine: '2026-01-01' }] }), /incompleta/)
  assert.equal(COSTANTI.maxRighe, 10)
})
