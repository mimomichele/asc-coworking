import { describe, it, expect } from 'vitest'
import {
  calcolaRiepilogo,
  durataMinutiTurno,
  estremiMese,
  meseLabel,
  mesePrecedenteRoma,
  validaMese,
} from '../src/lib/riepilogoPresenze.js'

// ----- helper per input leggibili -----
const dip = (id, nome, cognome, extra = {}) => ({
  id, nome, cognome, attivo: true, a_chiamata: false, ordine: null, ...extra,
})
const turno = (dipId, data, start, end) => ({
  dipendente_id: dipId, data, start_time: start, end_time: end,
})
const assenza = (dipId, type, start, end) => ({
  dipendente_id: dipId, type, start_date: start, end_date: end,
})

// ----- helpers puri -----
describe('helpers', () => {
  it('validaMese accetta solo YYYY-MM con mese 01..12', () => {
    expect(validaMese('2026-10')).toBe(true)
    expect(validaMese('2026-01')).toBe(true)
    expect(validaMese('2026-12')).toBe(true)
    expect(validaMese('2026-13')).toBe(false)
    expect(validaMese('2026-00')).toBe(false)
    expect(validaMese('2026-1')).toBe(false)
    expect(validaMese('')).toBe(false)
    expect(validaMese(null)).toBe(false)
  })

  it('meseLabel traduce in italiano', () => {
    expect(meseLabel('2026-10')).toBe('ottobre 2026')
    expect(meseLabel('2026-01')).toBe('gennaio 2026')
    expect(meseLabel('2027-12')).toBe('dicembre 2027')
  })

  it('estremiMese calcola primo e ultimo', () => {
    expect(estremiMese('2026-02')).toEqual({ primo: '2026-02-01', ultimo: '2026-02-28' })
    expect(estremiMese('2024-02')).toEqual({ primo: '2024-02-01', ultimo: '2024-02-29' }) // bisestile
    expect(estremiMese('2026-10')).toEqual({ primo: '2026-10-01', ultimo: '2026-10-31' })
    expect(estremiMese('2026-04')).toEqual({ primo: '2026-04-01', ultimo: '2026-04-30' })
  })

  it('mesePrecedenteRoma: 1 novembre a mezzanotte italiana -> ottobre', () => {
    // 2026-11-01 00:30 Europe/Rome  == 2026-10-31 23:30 UTC
    expect(mesePrecedenteRoma(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10')
    // 2026-01-01 03:00 Rome -> dicembre 2025
    expect(mesePrecedenteRoma(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12')
    // 2026-03-15 (metà mese) -> febbraio 2026
    expect(mesePrecedenteRoma(new Date('2026-03-15T10:00:00Z'))).toBe('2026-02')
  })

  it('durataMinutiTurno gestisce il cavallo di mezzanotte', () => {
    expect(durataMinutiTurno('08:00', '14:00')).toBe(360)
    expect(durataMinutiTurno('14:30', '18:00')).toBe(210)
    expect(durataMinutiTurno('22:00', '02:00')).toBe(240)        // +4h a cavallo
    expect(durataMinutiTurno('23:30', '07:30')).toBe(480)        // notturno
    expect(durataMinutiTurno('08:00:00', '14:30:30')).toBe(390)  // ignora i secondi
  })
})

// ----- aggregazione principale -----
describe('calcolaRiepilogo', () => {
  it('ottobre 2026: tre lavoratori con turni, ferie, malattia e un intermittente', () => {
    const dipendenti = [
      dip('A', 'Mario', 'Rossi'),
      dip('B', 'Lucia', 'Bianchi', { a_chiamata: true }),
      dip('C', 'Paolo', 'Verdi'),              // nessuna attività: non deve comparire
      dip('D', 'Anna', 'Neri', { ordine: 1 }), // solo ferie
    ]
    const shifts = [
      // Mario: 3 giorni 8-14 (6h) + 1 notturno a cavallo 22-02 (4h) = 22h, 4 giorni
      turno('A', '2026-10-01', '08:00', '14:00'),
      turno('A', '2026-10-02', '08:00', '14:00'),
      turno('A', '2026-10-03', '08:00', '14:00'),
      turno('A', '2026-10-05', '22:00', '02:00'),
      // Mario: turno nel giorno di ferie (12 ottobre) → NON conteggiato
      turno('A', '2026-10-12', '09:00', '13:00'),
      // Lucia (intermittente): 2 turni spezzati stessa data = 1 giorno, 7h
      turno('B', '2026-10-07', '09:00', '12:00'),
      turno('B', '2026-10-07', '14:00', '18:00'),
      // Un turno fuori mese (NON deve entrare nel conteggio)
      turno('B', '2026-09-30', '09:00', '13:00'),
      turno('B', '2026-11-01', '09:00', '13:00'),
    ]
    const leaves = [
      // Mario: 2 giorni di ferie (10-11 ottobre)
      assenza('A', 'ferie', '2026-10-10', '2026-10-11'),
      // Mario: 1 giorno di ferie anche il 12 → copre il turno sopra
      assenza('A', 'ferie', '2026-10-12', '2026-10-12'),
      // Lucia: 1 giorno di malattia (14 ottobre)
      assenza('B', 'malattia', '2026-10-14', '2026-10-14'),
      // Anna: 3 giorni di ferie, zero turni
      assenza('D', 'ferie', '2026-10-20', '2026-10-22'),
    ]

    const righe = calcolaRiepilogo({ mese: '2026-10', dipendenti, shifts, leaves })

    // Paolo (nessuna attività) non appare.
    // Ordine atteso: Anna per ordine=1; poi Lucia (Bianchi) e Mario (Rossi) per cognome.
    expect(righe.map(r => r.nome)).toEqual(['Anna Neri', 'Lucia Bianchi', 'Mario Rossi'])

    const anna = righe.find(r => r.nome === 'Anna Neri')
    expect(anna).toMatchObject({
      contratto: 'dipendente',
      giorni_lavorati: 0,
      ore_lavorate: 0,
      ferie: 3, malattia: 0, permessi: 0,
    })

    const mario = righe.find(r => r.nome === 'Mario Rossi')
    expect(mario).toMatchObject({
      contratto: 'dipendente',
      giorni_lavorati: 4,   // 01, 02, 03, 05 (05 conta per il giorno di inizio)
      ore_lavorate: 22,     // 6+6+6+4
      ferie: 3,             // 10, 11, 12
      malattia: 0, permessi: 0,
    })

    const lucia = righe.find(r => r.nome === 'Lucia Bianchi')
    expect(lucia).toMatchObject({
      contratto: 'intermittente',
      giorni_lavorati: 1,   // 2 turni stesso giorno = 1 giornata
      ore_lavorate: 7,      // 3 + 4
      ferie: 0, malattia: 1, permessi: 0,
    })

    // "permessi" sempre 0 e "note" vuote (decisione del progetto)
    for (const r of righe) {
      expect(r.permessi).toBe(0)
      expect(r.note).toBe('')
    }
  })

  it('ferie a cavallo di due mesi: solo i giorni DEL mese vengono contati', () => {
    const dipendenti = [dip('A', 'Mario', 'Rossi')]
    const leaves = [
      // Ferie 29 settembre → 3 ottobre: 3 giorni dentro ottobre (1, 2, 3)
      assenza('A', 'ferie', '2026-09-29', '2026-10-03'),
    ]
    const righe = calcolaRiepilogo({ mese: '2026-10', dipendenti, shifts: [], leaves })
    expect(righe).toHaveLength(1)
    expect(righe[0].ferie).toBe(3)
  })

  it('malattia ha priorità su ferie nello stesso giorno', () => {
    const dipendenti = [dip('A', 'Mario', 'Rossi')]
    const leaves = [
      assenza('A', 'ferie',    '2026-10-10', '2026-10-15'), // 6 giorni
      assenza('A', 'malattia', '2026-10-12', '2026-10-13'), // 2 giorni, sovrapposti
    ]
    const righe = calcolaRiepilogo({ mese: '2026-10', dipendenti, shifts: [], leaves })
    expect(righe[0]).toMatchObject({ ferie: 4, malattia: 2 })
  })

  it('throw con mese non valido', () => {
    expect(() => calcolaRiepilogo({ mese: '2026-13', dipendenti: [], shifts: [], leaves: [] }))
      .toThrow(/mese non valido/)
  })

  it('ordinamento rispetta ordine manuale, poi cognome, poi nome', () => {
    const dipendenti = [
      dip('C', 'Paolo', 'Verdi'),                // ordine null → fondo
      dip('A', 'Mario', 'Rossi', { ordine: 2 }),
      dip('B', 'Anna',  'Bianchi', { ordine: 1 }),
    ]
    const shifts = [
      turno('A', '2026-10-01', '09:00', '13:00'),
      turno('B', '2026-10-01', '09:00', '13:00'),
      turno('C', '2026-10-01', '09:00', '13:00'),
    ]
    const righe = calcolaRiepilogo({ mese: '2026-10', dipendenti, shifts, leaves: [] })
    expect(righe.map(r => r.nome)).toEqual(['Anna Bianchi', 'Mario Rossi', 'Paolo Verdi'])
  })
})
