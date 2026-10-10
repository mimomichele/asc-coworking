// ============================================================
// Compila il modulo PDF ministeriale UNI-Intermittenti (ML-15-01)
// partendo dal modello vuoto, come farebbe una persona in Acrobat.
//
// Il modulo e' un PDF "XFA": i dati veri stanno nel pacchetto XML
// `datasets` dentro il PDF, che e' quello che Acrobat mostra. Per i
// lettori che non conoscono XFA aggiorniamo anche i campi classici.
//
// `PDFLib` (pdf-lib) viene passato da fuori cosi' lo stesso file
// funziona nella Edge Function (Deno) e nei test (Node).
// ============================================================

import { CF_DATORE, CODICE_MODELLO, MAX_RIGHE_PER_MODULO, dataModulo } from './intermittenti.ts'

type Riga = { codice_fiscale: string; codice_comunicazione: string; data_inizio: string; data_fine: string }
type Opts = { emailDatore: string; annullamento: boolean }

const P = 'moduloIntermittenti[0].Campi[0].'

// nome campo (senza prefisso) -> valore
export function valoriCampi(righe: Riga[], opts: Opts): Record<string, string> {
  if (righe.length > MAX_RIGHE_PER_MODULO) throw new Error('Massimo 10 righe per modulo')
  const v: Record<string, string> = { CFdatorelavoro: CF_DATORE, EMmail: opts.emailDatore }
  for (let i = 1; i <= MAX_RIGHE_PER_MODULO; i++) {
    const r = righe[i - 1]
    v[`CFlavoratore${i}`] = r ? r.codice_fiscale.toUpperCase() : ''
    v[`CCcodcomunicazione${i}`] = r ? r.codice_comunicazione : ''
    v[`DTdatainizio${i}`] = r ? dataModulo(r.data_inizio) : ''
    v[`DTdatafine${i}`] = r ? dataModulo(r.data_fine) : ''
  }
  return v
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function datasetsXml(righe: Riga[], opts: Opts): string {
  const v = valoriCampi(righe, opts)
  const c = (n: string, x: string) => (x ? `<${n}>${esc(x)}</${n}>` : `<${n}/>`)
  let x = '<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><moduloIntermittenti><Campi>'
  x += c('CFdatorelavoro', v.CFdatorelavoro)
  x += c('BCbarcodeModello01', CODICE_MODELLO) + c('BCbarcodeModello01', CODICE_MODELLO)
  x += c('EMmail', v.EMmail)
  x += c('ANannullamento', opts.annullamento ? '1' : '0')
  for (let i = 1; i <= MAX_RIGHE_PER_MODULO; i++) {
    for (const n of ['CFlavoratore', 'CCcodcomunicazione', 'DTdatainizio', 'DTdatafine']) x += c(n + i, v[n + i])
  }
  return x + '</Campi></moduloIntermittenti></xfa:data></xfa:datasets>'
}

// deno-lint-ignore no-explicit-any
export async function compilaPdf(PDFLib: any, modello: Uint8Array, righe: Riga[], opts: Opts): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString, PDFString, PDFBool, PDFAcroText, PDFAcroCheckBox } = PDFLib
  const doc = await PDFDocument.load(modello, { updateMetadata: false })
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict)

  // 1. Dati XFA: sostituisce il pacchetto `datasets`.
  const xfa = acro.lookup(PDFName.of('XFA'), PDFArray)
  let fatto = false
  for (let i = 0; i + 1 < xfa.size(); i += 2) {
    const nome = xfa.lookup(i)
    if ((nome instanceof PDFString || nome instanceof PDFHexString) && nome.decodeText() === 'datasets') {
      xfa.set(i + 1, doc.context.register(doc.context.flateStream(datasetsXml(righe, opts))))
      fatto = true
    }
  }
  if (!fatto) throw new Error('Modello PDF non valido: pacchetto datasets mancante')

  // 2. Campi classici (per i lettori senza XFA): valori + ricalcolo dell'aspetto.
  const valori = valoriCampi(righe, opts)
  for (const [campo] of doc.catalog.getAcroForm().getAllFields()) {
    const nome: string = campo.getFullyQualifiedName() || ''
    if (!nome.startsWith(P)) continue
    const corto = nome.slice(P.length).replace(/^Table1\[0\]\.Row\d+\[0\]\./, '').replace(/\[0\]$/, '')
    if (campo instanceof PDFAcroText && corto in valori) {
      if (valori[corto]) campo.dict.set(PDFName.of('V'), PDFHexString.fromText(valori[corto]))
      else campo.dict.delete(PDFName.of('V'))
      for (const w of campo.getWidgets()) w.dict.delete(PDFName.of('AP'))
    } else if (campo instanceof PDFAcroCheckBox && corto === 'ANannullamento') {
      const stato = opts.annullamento ? (campo.getOnValue() ?? PDFName.of('1')) : PDFName.of('Off')
      campo.dict.set(PDFName.of('V'), stato)
      for (const w of campo.getWidgets()) w.dict.set(PDFName.of('AS'), stato)
    }
  }
  acro.set(PDFName.of('NeedAppearances'), PDFBool.True)

  // 3. Il modello ha una firma Adobe "diritti estesi per Reader" che vale
  //    solo sul file originale: su un file rigenerato va tolta, altrimenti
  //    Acrobat mostra un avviso di documento alterato.
  doc.catalog.delete(PDFName.of('Perms'))

  return await doc.save({ useObjectStreams: false })
}
