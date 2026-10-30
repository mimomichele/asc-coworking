// ============================================================
// Preventivi — helper condivisi.
//
// Un posto solo per: label/colori degli stati, label delle enum,
// normalizzazione telefono (coerente col generated column DB
// preventivi_norm_phone), costruzione dell'URL "Apri in Gmail"
// e nome evento per il badge in topbar.
// ============================================================

// Evento window per aggiornare il badge rosso in topbar senza
// aspettare il polling (es. dopo "Nuova richiesta" o cambio stato).
export const PREV_EVENTO_AGGIORNAMENTO = 'preventivi-changed'

// Stati con colore coerente coi badge PassaLacqua.
export const STATI = [
  { key: 'ricevuta',   label: 'Ricevuta',    fg: '#854F0B', bg: '#FAEEDA' },
  { key: 'inviato',    label: 'Inviato',     fg: '#185FA5', bg: '#E6F1FB' },
  { key: 'attesa',     label: 'In attesa',   fg: '#5F6368', bg: '#EEEEEC' },
  { key: 'confermata', label: 'Confermata',  fg: '#1E8E3E', bg: '#E6F6EF' },
  { key: 'persa',      label: 'Persa',       fg: '#C5221F', bg: '#FCEBEB' },
  { key: 'scaduta',    label: 'Scaduta',     fg: '#6B6B6B', bg: '#E8E7E2' },
]
export const statoDi = (k) => STATI.find(s => s.key === k) || STATI[0]

export const TIPOLOGIE = [
  { key: 'raduno',   label: 'Raduno / gruppo sportivo' },
  { key: 'scuola',   label: 'Gruppo scolastico / scambio' },
  { key: 'famiglia', label: 'Famiglia o singolo' },
]
export const tipologiaLabel = (k) =>
  TIPOLOGIE.find(t => t.key === k)?.label ?? k

export const CANALI = [
  { key: 'telefono',    label: 'Telefono' },
  { key: 'email',       label: 'Email' },
  { key: 'whatsapp',    label: 'WhatsApp' },
  { key: 'sito',        label: 'Sito' },
  { key: 'reception',   label: 'Reception' },
  { key: 'federazione', label: 'Federazione' },
  { key: 'altro',       label: 'Altro' },
]
export const canaleLabel = (k) => CANALI.find(c => c.key === k)?.label ?? k

export const SERVIZI = [
  { key: 'pernottamento', label: 'Pernottamento' },
  { key: 'pasti',         label: 'Pasti' },
  { key: 'piscina',       label: 'Piscina' },
  { key: 'campi',         label: 'Campi' },
  { key: 'altro',         label: 'Altro' },
]
export const serviziLabel = (keys) =>
  (keys || []).map(k => SERVIZI.find(s => s.key === k)?.label ?? k).join(', ')

export const MOTIVI_PERDITA = [
  { key: 'prezzo',               label: 'Prezzo' },
  { key: 'date_non_disponibili', label: 'Date non disponibili' },
  { key: 'nessuna_risposta',     label: 'Nessuna risposta' },
  { key: 'scelto_altro',         label: 'Ha scelto altra struttura' },
  { key: 'altro',                label: 'Altro' },
]
export const motivoLabel = (k) =>
  MOTIVI_PERDITA.find(m => m.key === k)?.label ?? k

// Formatta data range in italiano: "12-15 giugno 2026" o "12 giu – 15 lug 2026".
// Accetta ISO YYYY-MM-DD per sicurezza (nessuna timezone surprise).
export function fmtDataRange(dArr, dPart) {
  if (!dArr && !dPart) return null
  if (dArr && !dPart) return fmtData(dArr)
  if (!dArr && dPart) return `fino al ${fmtData(dPart)}`
  const [, mArr] = (dArr || '').split('-')
  const [, mPart] = (dPart || '').split('-')
  if (mArr === mPart) {
    const g1 = Number(dArr.slice(8, 10))
    const g2 = Number(dPart.slice(8, 10))
    const mese = fmtData(dArr).split(' ').slice(1).join(' ')
    return `${g1}-${g2} ${mese}`
  }
  return `${fmtData(dArr)} – ${fmtData(dPart)}`
}

export function fmtData(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDataOra(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function fmtEuro(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return num.toLocaleString('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  })
}

// Normalizza il telefono come il generated column lato DB:
//   +<cifre>, aggiunge +39 se non c'e' prefisso.
// Si usa SOLO per dedup lato client (ricerca contatto esistente):
// l'insert passa il telefono grezzo, il DB ricalcola telefono_norm.
export function normalizzaTelefono(raw) {
  if (!raw) return null
  const t = String(raw).trim()
  if (t === '') return null
  if (t.startsWith('+')) return '+' + t.replace(/\D/g, '')
  return '+39' + t.replace(/\D/g, '')
}

// Nome visualizzato di un contatto: societa' se c'e', altrimenti
// nome + cognome.
export function etichettaContatto(c) {
  if (!c) return '—'
  if (c.societa_ente) return c.societa_ente
  const nome = [c.nome, c.cognome].filter(Boolean).join(' ').trim()
  return nome || c.email || c.telefono || '—'
}

// Casella Gmail della reception: i preventivi arrivano su
// info@aschotel.com, che e' un alias "Invia come" di questo account.
// authuser forza Gmail web ad aprire questa casella anche se nel
// browser sono loggati altri account.
export const GMAIL_ACCOUNT_HOTEL = 'arezzo.sport.college@gmail.com'

// URL per aprire Gmail web col destinatario, oggetto e corpo
// precompilati. Non e' mailto:. "fs=1" apre il compose in full
// screen. "to=" accetta un singolo indirizzo. Usato per le richieste
// manuali (telefono/reception), che non hanno un thread da riprendere.
export function urlGmailCompose({ to, oggetto, corpo }) {
  const params = new URLSearchParams()
  params.set('authuser', GMAIL_ACCOUNT_HOTEL)
  params.set('view', 'cm')
  params.set('fs', '1')
  if (to) params.set('to', to)
  if (oggetto) params.set('su', oggetto)
  if (corpo) params.set('body', corpo)
  return 'https://mail.google.com/mail/?' + params.toString()
}

// URL che apre in Gmail web la conversazione originale di una
// richiesta arrivata via email: da li' la reception preme "Rispondi"
// e la risposta resta nello stesso thread del cliente.
export function urlGmailThread({ threadId, messageId }) {
  const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(GMAIL_ACCOUNT_HOTEL)}`
  const id = threadId || messageId
  return id ? `${base}#all/${id}` : base
}

// Fase dello scambio email, dai contatori aggiornati dal sync dei thread:
//   - da_rispondere: l'ultimo messaggio e' del cliente, dopo una nostra
//     risposta, e non c'e' stato un contatto successivo (Ricontattato)
//   - conversazione: abbiamo risposto piu' di una volta
//   - prima: abbiamo mandato la prima risposta
//   - null: nessun messaggio tracciato (richiesta manuale, o non ancora
//     sincronizzata)
export function faseConversazione(r) {
  if (!r || (!r.n_msg_out && !r.n_msg_in)) return null
  const clienteDopoDiNoi =
    r.ultimo_msg_direzione === 'in' && (r.n_msg_out || 0) > 0 &&
    (!r.data_ultimo_contatto || (r.ultimo_msg_at || '') > r.data_ultimo_contatto)
  if (clienteDopoDiNoi) {
    return { key: 'da_rispondere', label: 'Il cliente ha risposto', fg: '#C5221F', bg: '#FCEBEB' }
  }
  if ((r.n_msg_out || 0) > 1) {
    return {
      key: 'conversazione',
      label: `Conversazione · ${r.n_msg_out} inviate, ${r.n_msg_in || 0} ricevute`,
      fg: '#185FA5', bg: '#E6F1FB',
    }
  }
  if ((r.n_msg_out || 0) === 1) {
    return { key: 'prima', label: 'Prima risposta inviata', fg: '#1E8E3E', bg: '#E6F6EF' }
  }
  if ((r.n_msg_in || 0) > 1) {
    return { key: 'solleciti', label: `${r.n_msg_in} email dal cliente`, fg: '#854F0B', bg: '#FAEEDA' }
  }
  return null
}

// Oggetto suggerito: coerente coi template di DB.
export function suggerisciOggetto(richiesta, contatto) {
  const tipo = tipologiaLabel(richiesta.tipologia)
  const chi = contatto?.societa_ente || contatto?.cognome || contatto?.nome || ''
  const date = fmtDataRange(richiesta.data_arrivo, richiesta.data_partenza) || richiesta.periodo_note || ''
  return [`Preventivo ASC Hotel`, tipo, date, chi].filter(Boolean).join(' – ')
}
