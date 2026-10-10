import { describe, it, expect } from 'vitest'
import * as PDFLib from 'pdf-lib'
import { compilaPdf, datasetsXml } from '../supabase/functions/_shared/intermittenti_pdf.ts'
import { modelloPdf } from '../supabase/functions/_shared/modulo_intermittenti.ts'

const RIGHE = [
  { codice_fiscale: 'rssnna90a41a390x', codice_comunicazione: '1700026201104147', data_inizio: '2026-11-01', data_fine: '2026-11-10' },
  { codice_fiscale: 'VRDLGU85B02A390Y', codice_comunicazione: '1700026201104148', data_inizio: '2026-11-14', data_fine: '2026-11-14' },
]
const OPTS = { emailDatore: 'amministrazione@aschotel.com', annullamento: false }

// Rilegge il PDF compilato: pacchetto XFA `datasets` e valori dei campi classici.
async function leggi(bytes) {
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, decodePDFRawStream } = PDFLib
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
  const xfa = acro.lookup(PDFName.of('XFA'), PDFArray)
  let datasets = null
  for (let i = 0; i + 1 < xfa.size(); i += 2) {
    if (xfa.lookup(i).decodeText() === 'datasets') {
      const st = xfa.lookup(i + 1)
      datasets = new TextDecoder().decode(st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents())
    }
  }
  const campi = {}
  for (const [c] of doc.catalog.getAcroForm().getAllFields()) {
    const v = c.dict.lookup(PDFName.of('V'))
    if (v) campi[c.getFullyQualifiedName().split('.').pop()] = v.decodeText ? v.decodeText() : v.toString()
  }
  return { datasets, campi, perms: doc.catalog.has(PDFName.of('Perms')), pagine: doc.getPageCount() }
}

describe('modulo PDF', () => {
  it('il modello vuoto non contiene dati di lavoratori', async () => {
    const m = await leggi(modelloPdf())
    expect(m.datasets).toContain('<CFlavoratore1/>')
    expect(m.campi['CFlavoratore1[0]']).toBeUndefined()
    expect(m.campi['CFdatorelavoro[0]']).toBe('02044450514')
  })

  it('compila dati XFA e campi classici', async () => {
    const r = await leggi(await compilaPdf(PDFLib, modelloPdf(), RIGHE, OPTS))
    expect(r.pagine).toBe(1)
    expect(r.perms).toBe(false)
    expect(r.datasets).toBe(datasetsXml(RIGHE, OPTS))
    expect(r.datasets).toContain('<EMmail>amministrazione@aschotel.com</EMmail><ANannullamento>0</ANannullamento>')
    expect(r.datasets).toContain('<CFlavoratore1>RSSNNA90A41A390X</CFlavoratore1><CCcodcomunicazione1>1700026201104147</CCcodcomunicazione1><DTdatainizio1>01/11/2026</DTdatainizio1><DTdatafine1>10/11/2026</DTdatafine1>')
    expect(r.datasets).toContain('<DTdatainizio2>14/11/2026</DTdatainizio2><DTdatafine2>14/11/2026</DTdatafine2><CFlavoratore3/>')
    expect(r.campi['CFlavoratore1[0]']).toBe('RSSNNA90A41A390X')
    expect(r.campi['DTdatafine1[0]']).toBe('10/11/2026')
    expect(r.campi['CCcodcomunicazione2[0]']).toBe('1700026201104148')
    expect(r.campi['CFlavoratore3[0]']).toBeUndefined()
    expect(r.campi['ANannullamento[0]']).toBe('Off')
  })

  it('annullamento spunta la casella', async () => {
    const r = await leggi(await compilaPdf(PDFLib, modelloPdf(), RIGHE, { ...OPTS, annullamento: true }))
    expect(r.datasets).toContain('<ANannullamento>1</ANannullamento>')
    expect(r.campi['ANannullamento[0]']).not.toBe('Off')
  })

  it('rifiuta piu di 10 righe', async () => {
    await expect(compilaPdf(PDFLib, modelloPdf(), Array(11).fill(RIGHE[0]), OPTS)).rejects.toThrow()
  })
})
