// ============================================================
// Logica PURA delle comunicazioni obbligatorie per i lavoratori
// intermittenti (contratto a chiamata) — modulo ministeriale
// "UNI-Intermittenti" ML-15-01.
//
// Nessuna dipendenza da Deno o dal browser: questo file e' usato
//   - dalla Edge Function `intermittenti` (fonte di verita' per l'invio)
//   - dai test (vitest)
// Tutte le date sono stringhe 'YYYY-MM-DD'.
// ============================================================

export const MAX_RIGHE_PER_MODULO = 10
// Una comunicazione puo' coprire un ciclo di al massimo 30 giorni.
export const MAX_GIORNI_PER_RIGA = 30
export const CF_DATORE = '02044450514'
export const CODICE_MODELLO = 'ML-15-01'

export type Lavoratore = {
  id: string
  nome: string
  codice_fiscale: string
  codice_comunicazione: string
  a_chiamata_dal: string | null
}

// Riga gia' comunicata al Ministero e ancora valida (non annullata).
export type RigaAttiva = {
  id: string
  dipendente_id: string
  data_inizio: string
  data_fine: string
}

export type RigaDaComunicare = {
  dipendente_id: string
  nome: string
  codice_fiscale: string
  codice_comunicazione: string
  data_inizio: string
  data_fine: string
  urgente: boolean       // inizia oggi o domani
  sostituisce: boolean   // ricomunicazione dopo l'annullamento di una riga
}

export type RigaDaAnnullare = RigaAttiva & {
  nome: string
  codice_fiscale: string
  codice_comunicazione: string
  gia_iniziata: boolean  // la riga originale e' iniziata prima di oggi
}

export type Piano = {
  comunicazioni: RigaDaComunicare[]
  annullamenti: RigaDaAnnullare[]
}

export function addGiorni(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function giorniTra(a: string, b: string): string[] {
  const out: string[] = []
  for (let c = a; c <= b; c = addGiorni(c, 1)) out.push(c)
  return out
}

// Giorni -> intervalli: consecutivi su una riga sola (max 30 giorni),
// giorni staccati una riga ciascuno (inizio = fine).
export function raggruppaGiorni(giorni: string[]): { data_inizio: string; data_fine: string }[] {
  const ord = [...new Set(giorni)].sort()
  const out: { data_inizio: string; data_fine: string }[] = []
  let len = 0
  for (const g of ord) {
    const last = out[out.length - 1]
    if (last && addGiorni(last.data_fine, 1) === g && len < MAX_GIORNI_PER_RIGA) {
      last.data_fine = g
      len++
    } else {
      out.push({ data_inizio: g, data_fine: g })
      len = 1
    }
  }
  return out
}

// Confronta i giorni con turni e le righe gia' comunicate e dice cosa
// va comunicato e cosa va annullato.
//
// Regole:
//  - contano solo i giorni da oggi in poi e da `a_chiamata_dal` in poi;
//  - una riga comunicata i cui giorni hanno ancora tutti un turno resta valida;
//  - una riga comunicata a cui manca anche un solo giorno viene ANNULLATA
//    per intero e i giorni rimasti vengono ricomunicati (annullamento
//    "con le stesse date" della comunicazione originale);
//  - le righe finite prima di oggi non si toccano piu'.
export function calcolaPiano(
  lavoratori: Lavoratore[],
  giorniConTurni: Record<string, string[]>, // dipendente_id -> giorni
  righeAttive: RigaAttiva[],
  oggi: string,
): Piano {
  const domani = addGiorni(oggi, 1)
  const piano: Piano = { comunicazioni: [], annullamenti: [] }

  for (const lav of lavoratori) {
    const turni = new Set(giorniConTurni[lav.id] || [])
    const righe = righeAttive.filter(r => r.dipendente_id === lav.id)
    const anagrafica = {
      nome: lav.nome,
      codice_fiscale: lav.codice_fiscale,
      codice_comunicazione: lav.codice_comunicazione,
    }

    const coperti = new Set<string>()      // giorni di righe che restano valide
    const daRicomunicare = new Set<string>()

    for (const r of righe) {
      const giorni = giorniTra(r.data_inizio, r.data_fine)
      if (r.data_fine < oggi) { giorni.forEach(g => coperti.add(g)); continue }
      const lavorati = giorni.filter(g => turni.has(g))
      if (lavorati.length === giorni.length) {
        giorni.forEach(g => coperti.add(g))
      } else {
        piano.annullamenti.push({ ...r, ...anagrafica, gia_iniziata: r.data_inizio < oggi })
        lavorati.forEach(g => daRicomunicare.add(g))
      }
    }

    const dal = lav.a_chiamata_dal && lav.a_chiamata_dal > oggi ? lav.a_chiamata_dal : oggi
    const nuovi = [...turni].filter(g => g >= dal && !coperti.has(g) && !daRicomunicare.has(g))

    for (const [giorni, sostituisce] of [[[...daRicomunicare], true], [nuovi, false]] as const) {
      for (const iv of raggruppaGiorni(giorni as string[])) {
        piano.comunicazioni.push({
          dipendente_id: lav.id, ...anagrafica, ...iv,
          urgente: iv.data_inizio <= domani,
          sostituisce: sostituisce as boolean,
        })
      }
    }
  }

  piano.comunicazioni.sort((a, b) => a.data_inizio.localeCompare(b.data_inizio) || a.nome.localeCompare(b.nome))
  piano.annullamenti.sort((a, b) => a.data_inizio.localeCompare(b.data_inizio) || a.nome.localeCompare(b.nome))
  return piano
}

export function aBlocchi<T>(righe: T[], n = MAX_RIGHE_PER_MODULO): T[][] {
  const out: T[][] = []
  for (let i = 0; i < righe.length; i += n) out.push(righe.slice(i, i + n))
  return out
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' (formato dei campi data nel modulo ML-15-01).
export function dataModulo(ds: string): string {
  const [y, m, d] = ds.split('-')
  return `${d}/${m}/${y}`
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function campo(nome: string, valore: string | null): string {
  return valore ? `<${nome}>${esc(valore)}</${nome}>` : `<${nome}/>`
}

type RigaXml = { codice_fiscale: string; codice_comunicazione: string; data_inizio: string; data_fine: string }

// XML con la stessa struttura prodotta dal modulo PDF ministeriale
// (pulsante "invia"): sempre 10 gruppi di campi, vuoti se non usati.
export function generaXml(righe: RigaXml[], opts: { emailDatore: string; annullamento: boolean }): string {
  if (righe.length === 0) throw new Error('Nessuna riga da inviare')
  if (righe.length > MAX_RIGHE_PER_MODULO) throw new Error('Massimo 10 righe per modulo')
  let x = '<?xml version="1.0" encoding="UTF-8"?>'
  x += '<moduloIntermittenti><Campi>'
  x += campo('CFdatorelavoro', CF_DATORE)
  x += campo('BCbarcodeModello01', CODICE_MODELLO)
  x += campo('BCbarcodeModello01', CODICE_MODELLO)
  x += campo('EMmail', opts.emailDatore)
  x += campo('ANannullamento', opts.annullamento ? '1' : '0')
  for (let i = 1; i <= MAX_RIGHE_PER_MODULO; i++) {
    const r = righe[i - 1]
    x += campo(`CFlavoratore${i}`, r ? r.codice_fiscale.toUpperCase() : null)
    x += campo(`CCcodcomunicazione${i}`, r ? r.codice_comunicazione : null)
    x += campo(`DTdatainizio${i}`, r ? dataModulo(r.data_inizio) : null)
    x += campo(`DTdatafine${i}`, r ? dataModulo(r.data_fine) : null)
  }
  x += '</Campi></moduloIntermittenti>'
  return x
}

// Impronta dello stato "in attesa": serve a non rimandare lo stesso
// avviso Telegram due volte.
export function improntaPiano(p: Piano): string {
  const c = p.comunicazioni.map(r => `C|${r.dipendente_id}|${r.data_inizio}|${r.data_fine}`)
  const a = p.annullamenti.map(r => `A|${r.id}`)
  return [...c, ...a].sort().join(';')
}

// Un modulo (e quindi un'email) per lavoratore, cosi' allegato e oggetto
// possono riportare il suo codice fiscale e il suo nome. Oltre le 10 righe
// lo stesso lavoratore viene diviso su piu' moduli.
export function lottiPerLavoratore<T extends { dipendente_id: string }>(righe: T[]): T[][] {
  const perLav = new Map<string, T[]>()
  for (const r of righe) {
    if (!perLav.has(r.dipendente_id)) perLav.set(r.dipendente_id, [])
    perLav.get(r.dipendente_id)!.push(r)
  }
  return [...perLav.values()].flatMap(rr => aBlocchi(rr))
}

export const OGGETTO_EMAIL = 'Invio telematico Modulo Intermittenti'

export function oggettoEmail(nome: string, prova: boolean): string {
  const n = (nome || '').replace(/[\r\n]+/g, ' ').trim()
  return `${prova ? '[PROVA] ' : ''}${OGGETTO_EMAIL}${n ? ' - ' + n : ''}`
}

export function nomeAllegato(codiceFiscale: string): string {
  const cf = (codiceFiscale || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cf ? `UNI_Intermittenti_${cf}.pdf` : 'UNI_Intermittenti.pdf'
}
