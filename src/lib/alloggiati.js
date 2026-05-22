// ============================================================
// Generatore tracciato ALLOGGIATI WEB — Tabella 1 (168 char)
// Stesse righe valide sia per il file .txt (upload manuale)
// sia, in futuro, per i metodi Test/Send del Web Service SOAP.
// ============================================================

// Tipi alloggiato (dal tracciato)
export const TIPO = {
  OSPITE_SINGOLO: '16',
  CAPO_FAMIGLIA:  '17',
  CAPO_GRUPPO:    '18',
  FAMILIARE:      '19',
  MEMBRO_GRUPPO:  '20',
};

// --- helper di formattazione a lunghezza fissa ---
// padText: tronca/riempie con spazi a destra fino a len
export function padText(value, len) {
  const s = (value ?? '').toString().toUpperCase();
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}
// blank: stringa di soli spazi
function blank(len) { return ' '.repeat(len); }

// formatta una Date (o stringa ISO yyyy-mm-dd) in gg/mm/aaaa
export function dmy(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  const gg = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const aaaa = String(date.getFullYear());
  return `${gg}/${mm}/${aaaa}`;
}

// Costruisce UNA riga da 168 caratteri.
// guest: oggetto con i campi (codici già risolti dalle tabelle ufficiali)
// opts.includeDoc: true per Ospite Singolo / Capo Famiglia / Capo Gruppo
export function buildRow(guest, opts = {}) {
  const includeDoc = opts.includeDoc !== false; // default true
  const natoInItalia = !!guest.comune_nascita_cod; // se c'è il comune -> nato in IT

  let row = '';
  row += padText(guest.tipo_alloggiato, 2);                 //   0-1   Tipo alloggiato
  row += padText(dmy(guest.data_arrivo), 10);               //   2-11  Data arrivo gg/mm/aaaa
  row += padText(String(guest.permanenza).padStart(2,'0'),2)//  12-13  Permanenza (max 30)
  row += padText(guest.cognome, 50);                        //  14-63  Cognome
  row += padText(guest.nome, 30);                           //  64-93  Nome
  row += padText(guest.sesso, 1);                           //  94     Sesso 1/2
  row += padText(dmy(guest.data_nascita), 10);              //  95-104 Data nascita
  // Comune e provincia nascita: solo se nato in Italia, altrimenti blank
  row += natoInItalia ? padText(guest.comune_nascita_cod, 9) : blank(9);   // 105-113
  row += natoInItalia ? padText(guest.provincia_nascita, 2) : blank(2);    // 114-115
  row += padText(guest.stato_nascita_cod, 9);               // 116-124 Stato nascita (sempre)
  row += padText(guest.cittadinanza_cod, 9);                // 125-133 Cittadinanza (sempre)

  // Campi documento: presenti solo per i "capo"/singolo; blank per familiari/membri
  if (includeDoc) {
    row += padText(guest.tipo_documento_cod, 5);            // 134-138 Tipo documento
    row += padText(guest.numero_documento, 20);             // 139-158 Numero documento
    row += padText(guest.luogo_rilascio_cod, 9);            // 159-167 Luogo rilascio
  } else {
    row += blank(5) + blank(20) + blank(9);                 // 34 blank totali
  }
  return row;
}

// Costruisce l'intero file da una lista di "nuclei".
// Ogni nucleo = { capo: guest, membri: [guest,...] }
// Un ospite singolo è un nucleo con membri=[].
export function buildFile(nuclei) {
  const rows = [];
  for (const n of nuclei) {
    const haMembri = n.membri && n.membri.length > 0;
    // Il capo: se ha membri -> Capo Famiglia, altrimenti Ospite Singolo
    const capo = { ...n.capo,
      tipo_alloggiato: haMembri ? TIPO.CAPO_FAMIGLIA : TIPO.OSPITE_SINGOLO };
    rows.push(buildRow(capo, { includeDoc: true }));
    // I membri: tipo Familiare, senza campi documento
    for (const m of (n.membri || [])) {
      const membro = { ...m, tipo_alloggiato: TIPO.FAMILIARE,
        data_arrivo: capo.data_arrivo, permanenza: capo.permanenza };
      rows.push(buildRow(membro, { includeDoc: false }));
    }
  }
  // CR+LF tra le righe, NIENTE dopo l'ultima
  return rows.join('\r\n');
}
