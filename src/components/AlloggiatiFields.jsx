// Componente controllato per i campi del tracciato ALLOGGIATI WEB.
// Usato in NuovoOspite, in "aggiungi membro" e in "modifica" della SchedaOspite.
// Stato/cittadinanza/comune/luogo-rilascio/tipo-documento usano un autocomplete
// remoto sulle tabelle ufficiali cod_stati/cod_comuni/cod_documenti.
// Il comune deriva automaticamente la provincia.

import Autocomplete from './Autocomplete.jsx'
import BirthDatePicker from './BirthDatePicker.jsx'

const fmtStato     = r => r?.descrizione || ''
const fmtComune    = r => r ? `${r.descrizione}${r.provincia ? ` (${r.provincia})` : ''}` : ''
const fmtDocumento = r => r?.descrizione || ''

// Stato vuoto di partenza per un nuovo form.
export function emptyAlloggiati() {
  return {
    sesso: '', data_nascita: '',
    _bornInItaly: false,                  // UI-only, non persistito
    comune_nascita_cod: '', provincia_nascita: '',
    stato_nascita_cod: '', cittadinanza_cod: '',
    tipo_documento_cod: '', numero_documento: '', luogo_rilascio_cod: '',
    documento_acquisito: false, residente_arezzo: false,
  }
}

// Costruisce lo stato del form a partire da una riga members del DB.
export function alloggiatiFromMember(m) {
  if (!m) return emptyAlloggiati()
  return {
    sesso: m.sesso || '',
    data_nascita: m.data_nascita || '',
    _bornInItaly: !!m.comune_nascita_cod,
    comune_nascita_cod: m.comune_nascita_cod || '',
    provincia_nascita: m.provincia_nascita || '',
    stato_nascita_cod: m.stato_nascita_cod || '',
    cittadinanza_cod: m.cittadinanza_cod || '',
    tipo_documento_cod: m.tipo_documento_cod || '',
    numero_documento: m.numero_documento || '',
    luogo_rilascio_cod: m.luogo_rilascio_cod || '',
    documento_acquisito: !!m.documento_acquisito,
    residente_arezzo: !!m.residente_arezzo,
  }
}

// Converte lo stato del form nel payload da inviare a Supabase
// (rimuove _bornInItaly, normalizza maiuscole, trim, null).
export function alloggiatiToPayload(v) {
  const t = x => (typeof x === 'string' ? x.trim() : x)
  return {
    sesso: v.sesso || null,
    data_nascita: v.data_nascita || null,
    comune_nascita_cod: v._bornInItaly ? (t(v.comune_nascita_cod) || null) : null,
    provincia_nascita: v._bornInItaly ? (t(v.provincia_nascita)?.toUpperCase() || null) : null,
    stato_nascita_cod: t(v.stato_nascita_cod) || null,
    cittadinanza_cod: t(v.cittadinanza_cod) || null,
    tipo_documento_cod: t(v.tipo_documento_cod)?.toUpperCase() || null,
    numero_documento: t(v.numero_documento) || null,
    luogo_rilascio_cod: t(v.luogo_rilascio_cod) || null,
    documento_acquisito: !!v.documento_acquisito,
    residente_arezzo: !!v.residente_arezzo,
  }
}

// Validazione bloccante: ritorna stringa di errore o null se ok.
// Usata nei form di creazione (NuovoOspite, aggiungi membro).
// Non chiamarla nei pannelli di edit "graduale" (la reception completa nel tempo).
export function validateAlloggiati(v) {
  if (!v.sesso) return 'Indica il sesso (M/F)'
  if (!v.data_nascita) return 'Inserisci la data di nascita'
  if (!v.stato_nascita_cod?.trim()) return 'Inserisci il codice dello stato di nascita'
  if (!v.cittadinanza_cod?.trim()) return 'Inserisci il codice di cittadinanza'
  if (v._bornInItaly) {
    if (!v.comune_nascita_cod?.trim()) return 'Inserisci il codice del comune di nascita'
    if (!v.provincia_nascita?.trim())  return 'Inserisci la sigla della provincia di nascita'
  }
  if (!v.tipo_documento_cod?.trim()) return 'Inserisci il tipo di documento'
  if (!v.numero_documento?.trim())   return 'Inserisci il numero del documento'
  if (!v.luogo_rilascio_cod?.trim()) return 'Inserisci il codice del luogo di rilascio'
  return null
}

export default function AlloggiatiFields({ value, onChange, requiredMarker = true }) {
  const set = (patch) => onChange({ ...value, ...patch })
  const setBornInItaly = (v) => {
    if (v) onChange({ ...value, _bornInItaly: true })
    else   onChange({ ...value, _bornInItaly: false, comune_nascita_cod: '', provincia_nascita: '' })
  }
  const r = requiredMarker ? ' *' : ''

  return (
    <div>
      {/* anagrafica */}
      <div style={styles.sectionLabel}>Anagrafica</div>
      <div style={styles.grid2}>
        <div className="field">
          <label>Sesso{r}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: '1', l: 'M' }, { v: '2', l: 'F' }].map(o => (
              <div
                key={o.v}
                onClick={() => set({ sesso: o.v })}
                style={pillBtn(value.sesso === o.v, '#854F0B', '#FAEEDA', '#F5C842', true)}
              >
                {o.l}
              </div>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Data di nascita{r}</label>
          {/* 3 select (giorno/mese/anno) al posto di <input type="date">:
              il selettore nativo Android forza scorrimento mese-per-mese
              e rende impossibile inserire anni di nascita lontani. */}
          <BirthDatePicker
            value={value.data_nascita}
            onChange={(iso) => set({ data_nascita: iso })}
          />
        </div>

        <div className="field">
          <label>Stato di nascita{r}</label>
          <Autocomplete
            table="cod_stati"
            value={value.stato_nascita_cod}
            onChange={(cod) => set({ stato_nascita_cod: cod || '' })}
            format={fmtStato}
            placeholder="Cerca: Italia, Romania, Albania…"
          />
        </div>
        <div className="field">
          <label>Cittadinanza{r}</label>
          <Autocomplete
            table="cod_stati"
            value={value.cittadinanza_cod}
            onChange={(cod) => set({ cittadinanza_cod: cod || '' })}
            format={fmtStato}
            placeholder="Cerca: Italia, Romania, Albania…"
          />
        </div>

        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>Luogo di nascita{r}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: true,  l: 'Nato in Italia' },
              { v: false, l: 'Nato all’estero' },
            ].map(o => (
              <div
                key={String(o.v)}
                onClick={() => setBornInItaly(o.v)}
                style={pillBtn(value._bornInItaly === o.v, '#854F0B', '#FAEEDA', '#F5C842', true)}
              >
                {o.l}
              </div>
            ))}
          </div>
          {!value._bornInItaly && (
            <div className="hint">Per i nati all'estero comune/provincia restano vuoti (regola del tracciato).</div>
          )}
        </div>

        {value._bornInItaly && (
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Comune di nascita{r}</label>
            <Autocomplete
              table="cod_comuni"
              value={value.comune_nascita_cod}
              onChange={(cod, row) => onChange({
                ...value,
                comune_nascita_cod: cod || '',
                // La provincia segue il comune: deriva dalla riga di cod_comuni.
                provincia_nascita: row?.provincia || '',
              })}
              format={fmtComune}
              placeholder="Cerca: Arezzo, Roma, Firenze…"
            />
            {value.provincia_nascita && (
              <div className="hint">
                Provincia: <strong>{value.provincia_nascita}</strong> (impostata automaticamente dal comune)
              </div>
            )}
          </div>
        )}
      </div>

      {/* documento */}
      <div style={styles.sectionLabel}>Documento</div>
      <div style={styles.grid2}>
        <div className="field">
          <label>Tipo documento{r}</label>
          <Autocomplete
            table="cod_documenti"
            value={value.tipo_documento_cod}
            onChange={(cod) => set({ tipo_documento_cod: cod || '' })}
            format={fmtDocumento}
            placeholder="Cerca: Carta identità, Passaporto, Patente…"
          />
        </div>
        <div className="field">
          <label>Numero documento{r}</label>
          <input
            maxLength={20}
            value={value.numero_documento}
            onChange={e => set({ numero_documento: e.target.value })}
            placeholder="numero/sigla"
          />
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>Luogo di rilascio{r}</label>
          <Autocomplete
            table="cod_comuni"
            value={value.luogo_rilascio_cod}
            onChange={(cod) => set({ luogo_rilascio_cod: cod || '' })}
            format={fmtComune}
            placeholder="Cerca il comune di rilascio del documento…"
          />
        </div>
      </div>

      {/* flag operativi */}
      <div style={styles.sectionLabel}>Stato</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div
          onClick={() => set({ documento_acquisito: !value.documento_acquisito })}
          style={pillBtn(!!value.documento_acquisito, '#3B6D11', '#EAF3DE', '#3B6D11', false)}
        >
          {value.documento_acquisito ? '✓ ' : ''}Documento acquisito
        </div>
        <div
          onClick={() => set({ residente_arezzo: !value.residente_arezzo })}
          style={pillBtn(!!value.residente_arezzo, '#185FA5', '#E6F1FB', '#185FA5', false)}
        >
          {value.residente_arezzo ? '✓ ' : ''}Residente Arezzo (esente imposta)
        </div>
      </div>
    </div>
  )
}

function pillBtn(active, fg, bg, borderActive, flex) {
  return {
    flex: flex ? 1 : undefined,
    padding: '8px 14px', borderRadius: 8, textAlign: flex ? 'center' : 'left',
    border: `0.5px solid ${active ? borderActive : '#ccc'}`,
    background: active ? bg : '#fff',
    color: active ? fg : '#888',
    cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 500 : 400,
  }
}

const styles = {
  sectionLabel: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 14 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
}
