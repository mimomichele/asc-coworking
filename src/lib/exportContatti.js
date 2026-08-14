// ============================================================
// exportContatti — helper puri per l'export contatti dall'admin
// Ospiti verso vCard 3.0 (rubrica) e CSV (Excel italiano).
//
// Regole (concordate con l'utente):
// - Dedup per telefono normalizzato (1 contatto per numero).
//   accounts.phone e' l'unica sorgente reale: members NON ha
//   colonna phone in schema. Familiari senza phone proprio
//   ereditano da titolare → naturalmente deduplicati.
// - Nome contatto = "Nome Cognome TAG" (per ricerca WhatsApp
//   in blocco sul tag).
// - TAG sanificato: uppercase + [A-Z0-9] only + fallback COW2025.
// - Phone normalizzato al formato internazionale +39...
// - CSV separatore ';' per Excel italiano; UTF-8 BOM per accenti.
//   Tutti i campi sono quotati con "..." e virgolette interne
//   raddoppiate → nessun risk di collisione col separatore.
// ============================================================

// Normalizza un phone raw (text libero da accounts.phone).
// Ritorna '+39...' se valido, null altrimenti.
export function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null
  // tieni solo cifre e '+', tutto il resto via (spazi, trattini,
  // parentesi, punti, testo come "chiama al bar" ecc.)
  let cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null
  // 00... → +... (prefisso internazionale alternativo)
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2)
  // nessun prefisso: decidi in base alla lunghezza
  if (!cleaned.startsWith('+')) {
    // '39' nudo iniziale + almeno 9 cifre dopo → aggiungi solo '+'
    if (cleaned.startsWith('39') && cleaned.length >= 11) {
      cleaned = '+' + cleaned
    } else {
      cleaned = '+39' + cleaned
    }
  }
  // sanity: dopo il '+' solo cifre
  if (!/^\+\d+$/.test(cleaned)) return null
  // minima lunghezza plausibile (es. +39 seguito da 7+ cifre)
  if (cleaned.length < 10) return null
  return cleaned
}

// Sanifica il TAG: uppercase + [A-Z0-9] only, fallback COW2025.
export function sanitizeTag(raw) {
  const t = (raw || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return t || 'COW2025'
}

// Stato aggregato dell'abbonamento di un account.
// Coerente con la logica di InEsaurimento/Esauriti/hotfix multi-active.
export function accountAbbStato(account) {
  const subs = (account.members || []).flatMap(m => m.subscriptions || [])
  const activeEntries = subs.filter(s => s.active && s.entries_total > 0)
  if (activeEntries.length === 0) return 'nessun_sub'
  const withRemaining = activeEntries.filter(s => s.entries_used < s.entries_total)
  if (withRemaining.length === 0) return 'esaurito'
  // "in esaurimento" = totale rimasti sui sub attivi <= 3
  // (stessa semantica del hotfix multi-active in GuestHome)
  const totRem = withRemaining.reduce(
    (sum, s) => sum + Math.max(0, s.entries_total - s.entries_used),
    0
  )
  if (totRem <= 3) return 'in_esaurimento'
  return 'attivo'
}

function statoLabel(stato) {
  switch (stato) {
    case 'attivo':         return 'Attivo'
    case 'in_esaurimento': return 'In esaurimento'
    case 'esaurito':       return 'Esaurito'
    case 'nessun_sub':     return 'Nessun abbonamento'
    default:               return '—'
  }
}

// Ritorna true se l'account passa il filtro selezionato in UI.
export function matchFilter(account, filter) {
  const stato = accountAbbStato(account)
  if (filter === 'tutti') return true
  if (filter === 'attivi') {
    // "Con abbonamento attivo" = ha almeno un sub con ingressi disponibili
    // (esclude "esaurito" e "nessun_sub"). Se vuoi anche esauriti, usa "Tutti"
    // o "Solo esauriti".
    return stato === 'attivo' || stato === 'in_esaurimento'
  }
  if (filter === 'esauriti')       return stato === 'esaurito'
  if (filter === 'in_esaurimento') return stato === 'in_esaurimento'
  return true
}

// Costruisce la lista contatti da esportare. Ritorna:
//   { contacts, skipped, tagClean }
// - contacts: array di record pronti per vCard/CSV, dedup per phone
// - skipped: [{nome, motivo}] elenco account esclusi (per anteprima)
// - tagClean: il TAG sanificato effettivamente usato
//
// Account con attivo=false (disattivati manualmente) sono sempre esclusi
// senza comparire tra i saltati (sono stati chiusi apposta).
export function buildContactList(accounts, filter, tag) {
  const tagClean = sanitizeTag(tag)
  const selezionati = (accounts || [])
    .filter(a => a && a.attivo !== false)
    .filter(a => matchFilter(a, filter))

  const seenPhones = new Set()
  const contacts = []
  const skipped = []

  for (const a of selezionati) {
    const phone = normalizePhone(a.phone)
    if (!phone) {
      skipped.push({
        nome: `${a.name || ''} ${a.surname || ''}`.trim() || '(senza nome)',
        motivo: !a.phone ? 'telefono mancante' : `telefono non valido: "${a.phone}"`,
      })
      continue
    }
    if (seenPhones.has(phone)) {
      // duplicato tra account diversi (raro): dedup silenzioso
      continue
    }
    seenPhones.add(phone)

    // familiari = tutti i members TRANNE quello col nome/cognome del titolare
    // (il titolare compare quasi sempre anche nella lista members)
    const familiari = (a.members || [])
      .filter(m => !(m.name === a.name && m.surname === a.surname))
      .map(m => `${m.name || ''} ${m.surname || ''}`.trim())
      .filter(Boolean)

    contacts.push({
      nome: a.name || '',
      cognome: a.surname || '',
      tag: tagClean,
      telefono: phone,
      tipoAccount: a.type === 'family' ? 'Familiare' : 'Singolo',
      // Separatore INTERNO virgola (non ';') per non collidere col
      // separatore CSV. Il quoting con "..." rende comunque robusti.
      membri: familiari.join(', '),
      statoAbb: statoLabel(accountAbbStato(a)),
    })
  }

  return { contacts, skipped, tagClean }
}

// ============================================================
// vCard 3.0 output
// ============================================================
// Escape del valore di un singolo componente vCard: \\, ;, ,, newline.
// I ';' strutturali (es. separatori dei componenti in N:) NON passano
// da qui — sono aggiunti direttamente al template.
function vcardValueEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function toVcf(contacts) {
  const blocks = contacts.map(c => {
    const fn = vcardValueEscape(`${c.nome} ${c.cognome} ${c.tag}`)
    const nome = vcardValueEscape(c.nome)
    const cognome = vcardValueEscape(c.cognome)
    // N: cognome;nome;;; (5 componenti standard, gli ultimi 3 vuoti)
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${fn}`,
      `N:${cognome};${nome};;;`,
      `TEL;TYPE=CELL:${c.telefono}`,
      'END:VCARD',
    ].join('\r\n')
  })
  // vCard spec richiede line endings \r\n. Trailing \r\n dopo l'ultimo END.
  return blocks.join('\r\n') + '\r\n'
}

// ============================================================
// CSV output (Excel italiano)
// ============================================================
// Ogni campo viene quotato con "..." e le virgolette interne
// vengono raddoppiate (RFC 4180). Cosi' il file regge sempre,
// anche se un campo contiene ; o " o \n.
function csvQuote(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

export function toCsv(contacts) {
  const headers = [
    'Nome', 'Cognome', 'Tag', 'Telefono',
    'Tipo account', 'Membri', 'Stato abbonamento',
  ]
  const lines = [headers.map(csvQuote).join(';')]
  for (const c of contacts) {
    lines.push([
      c.nome, c.cognome, c.tag, c.telefono,
      c.tipoAccount, c.membri, c.statoAbb,
    ].map(csvQuote).join(';'))
  }
  // UTF-8 BOM (accenti in Excel italiano) + CRLF per compatibilita' Windows.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ============================================================
// Download client-side + naming file
// ============================================================
export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// contatti-asc-COW2025-20260813.vcf
export function filenameFor(tag, ext) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `contatti-asc-${sanitizeTag(tag)}-${y}${m}${day}.${ext}`
}
