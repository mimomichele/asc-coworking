// ============================================================
// Lavoratori intermittenti (contratto a chiamata) — logica pura.
// Unica fonte di verita' per raggruppamento delle date e XML del
// modello ministeriale ML-15-01. Importata sia dal browser
// (src/lib/intermittenti.js) sia dalla Edge Function
// invia-intermittenti. Nessuna dipendenza, nessun accesso a rete/DB.
// Date sempre come stringhe 'YYYY-MM-DD'.
// ============================================================

export const COSTANTI = {
  cfDatore: '02044450514',
  email: 'amministrazione@aschotel.com',
  destinatario: 'intermittenti@pec.lavoro.gov.it',
  oggetto: 'Invio telematico Modulo Intermittenti',
  corpo: 'Invio telematico Modulo Intermittenti',
  nomeAllegato: 'moduloIntermittenti.xml', // DA VERIFICARE con l'XML del modulo originale
  maxRighe: 10,
}

// ---------- date ----------

export function addGiorni(ds, n) {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

// Formato data dentro l'XML. Il modulo ML-15-01 sembra usare AAAA-MM-GG:
// DA VERIFICARE byte per byte con un XML prodotto dal modulo originale.
export function fmtDataXml(ds) {
  return ds
}

// Da un elenco di giorni (anche doppi, in qualsiasi ordine) alle righe
// del modulo: giorni consecutivi -> una riga inizio/fine; giorni
// staccati -> una riga per giorno con inizio = fine.
export function raggruppaGiorni(giorni) {
  const uniq = [...new Set(giorni.filter(Boolean))].sort()
  const righe = []
  for (const g of uniq) {
    const ultima = righe[righe.length - 1]
    if (ultima && addGiorni(ultima.fine, 1) === g) ultima.fine = g
    else righe.push({ inizio: g, fine: g })
  }
  return righe
}

// Spezza le righe in invii da al massimo `max` righe ciascuno.
export function spezzaInvii(righe, max = COSTANTI.maxRighe) {
  const out = []
  for (let i = 0; i < righe.length; i += max) out.push(righe.slice(i, i + max))
  return out
}

// ---------- pianificazione ----------

export function nomeLavoratore(d) {
  return [d?.nome, d?.cognome].filter(Boolean).join(' ').trim() || '—'
}

// Dai turni (shifts) e dai lavoratori (dipendenti) alle righe da
// comunicare: solo turni con com_stato 'da_comunicare' di lavoratori a
// chiamata. Ogni riga: { dipendente_id, nome, codice_fiscale,
// codice_comunicazione, inizio, fine, giorni, shift_ids }.
// Ordine: per nome lavoratore, poi per data.
export function pianificaComunicazioni(shifts, dipendenti) {
  const dip = new Map(dipendenti.map(d => [d.id, d]))
  const perDip = new Map()
  for (const s of shifts) {
    if (s.com_stato !== 'da_comunicare') continue
    const d = dip.get(s.dipendente_id)
    if (!d || !d.a_chiamata) continue
    if (!perDip.has(d.id)) perDip.set(d.id, [])
    perDip.get(d.id).push(s)
  }
  const righe = []
  const ordinati = [...perDip.keys()].sort((a, b) => nomeLavoratore(dip.get(a)).localeCompare(nomeLavoratore(dip.get(b)), 'it'))
  for (const id of ordinati) {
    const d = dip.get(id)
    const turni = perDip.get(id)
    for (const r of raggruppaGiorni(turni.map(s => s.data))) {
      const inRiga = turni.filter(s => s.data >= r.inizio && s.data <= r.fine)
      righe.push({
        dipendente_id: id,
        nome: nomeLavoratore(d),
        codice_fiscale: d.codice_fiscale || '',
        codice_comunicazione: d.codice_comunicazione || '',
        inizio: r.inizio,
        fine: r.fine,
        giorni: new Set(inRiga.map(s => s.data)).size,
        shift_ids: inRiga.map(s => s.id),
      })
    }
  }
  return righe
}

// Turni da comunicare che iniziano entro 24 ore (o gia' iniziati):
// vanno segnalati con forza.
export function turniUrgenti(shifts, dipendenti, adesso = new Date()) {
  const chiamata = new Set(dipendenti.filter(d => d.a_chiamata).map(d => d.id))
  const limite = adesso.getTime() + 24 * 3600 * 1000
  return shifts.filter(s => {
    if (s.com_stato !== 'da_comunicare' || !chiamata.has(s.dipendente_id)) return false
    const inizio = new Date(`${s.data}T${String(s.start_time || '00:00').slice(0, 5)}:00`).getTime()
    return inizio <= limite
  })
}

// ---------- validazione anagrafica ----------

const CF_REGEX = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/

export function normalizzaCodice(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '')
}

export function validaCodiceFiscale(cf) {
  return CF_REGEX.test(normalizzaCodice(cf))
}

// Codice della comunicazione UNILAV di assunzione: 16 caratteri.
export function validaCodiceComunicazione(c) {
  return /^[A-Z0-9]{16}$/.test(normalizzaCodice(c))
}

// ---------- XML ML-15-01 ----------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// righe: [{ codice_fiscale, codice_comunicazione, inizio, fine }] (max 10)
// annullamento: true -> ANannullamento = 1 (stesse date della riga originale).
// La struttura (ordine dei tag, doppio BCbarcodeModello01, tag vuoti
// autochiusi per le righe non usate) riproduce quella del modulo
// ministeriale ML-15-01. Intestazione e indentazione DA VERIFICARE
// con un XML di esempio del modulo originale.
export function generaXml({ cfDatore = COSTANTI.cfDatore, email = COSTANTI.email, annullamento = false, righe }) {
  if (!Array.isArray(righe) || righe.length === 0) throw new Error('Nessuna riga da comunicare')
  if (righe.length > COSTANTI.maxRighe) throw new Error(`Massimo ${COSTANTI.maxRighe} righe per comunicazione`)
  const L = []
  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push('<moduloIntermittenti>')
  L.push('  <Campi>')
  L.push(`    <CFdatorelavoro>${esc(cfDatore)}</CFdatorelavoro>`)
  L.push('    <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>')
  L.push('    <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>')
  L.push(`    <EMmail>${esc(email)}</EMmail>`)
  L.push(`    <ANannullamento>${annullamento ? 1 : 0}</ANannullamento>`)
  for (let i = 1; i <= COSTANTI.maxRighe; i++) {
    const r = righe[i - 1]
    if (r) {
      if (!r.codice_fiscale || !r.codice_comunicazione || !r.inizio || !r.fine) {
        throw new Error(`Riga ${i} incompleta: servono codice fiscale, codice comunicazione, data inizio e data fine`)
      }
      L.push(`    <CFlavoratore${i}>${esc(normalizzaCodice(r.codice_fiscale))}</CFlavoratore${i}>`)
      L.push(`    <CCcodcomunicazione${i}>${esc(normalizzaCodice(r.codice_comunicazione))}</CCcodcomunicazione${i}>`)
      L.push(`    <DTdatainizio${i}>${esc(fmtDataXml(r.inizio))}</DTdatainizio${i}>`)
      L.push(`    <DTdatafine${i}>${esc(fmtDataXml(r.fine))}</DTdatafine${i}>`)
    } else {
      L.push(`    <CFlavoratore${i}/>`)
      L.push(`    <CCcodcomunicazione${i}/>`)
      L.push(`    <DTdatainizio${i}/>`)
      L.push(`    <DTdatafine${i}/>`)
    }
  }
  L.push('  </Campi>')
  L.push('</moduloIntermittenti>')
  return L.join('\n') + '\n'
}

// ---------- formattazione per l'interfaccia ----------

export function fmtDataIt(ds) {
  if (!ds) return ''
  const [y, m, d] = ds.split('-')
  return `${d}/${m}/${y}`
}

export function fmtRigaDate(r) {
  return r.inizio === r.fine ? fmtDataIt(r.inizio) : `${fmtDataIt(r.inizio)} – ${fmtDataIt(r.fine)}`
}
