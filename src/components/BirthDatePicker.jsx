// ============================================================
// BirthDatePicker — 3 dropdown (giorno / mese / anno) per data
// di nascita, in sostituzione di <input type="date"> nativo.
//
// Perche': il selettore nativo Android per <input type="date">
// parte dalla data odierna e impone scorrimento mese-per-mese
// all'indietro. Per anni di nascita lontani (es. 1965) sono
// centinaia di click — di fatto inusabile, e blocca i flussi
// in cui la data nascita e' obbligatoria.
//
// Props:
//   value:    string ISO 'YYYY-MM-DD' (o '' / null se non valorizzata)
//   onChange: (iso: string) => void
//             ritorna 'YYYY-MM-DD' SOLO quando i 3 valori sono tutti
//             selezionati; ritorna '' se la data e' parziale.
//   disabled: boolean (read-only; stile greyed coerente con altri input)
//   yearsBack: numero di anni indietro (default 100)
//
// Anno corrente in cima al dropdown (ordinamento desc). Il giorno
// si adatta al mese/anno selezionato (es. 29/02 solo nei bisestili).
// ============================================================

import { useEffect, useMemo, useState } from 'react'

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

// Giorni di un mese in un dato anno (gestisce i bisestili).
// new Date(year, month, 0) = ultimo giorno del mese precedente
// (mese 1-based qui), quindi daysInMonth(2024, 2) = 29.
function daysInMonth(year, month) {
  if (!year || !month) return 31
  return new Date(Number(year), Number(month), 0).getDate()
}

function pad2(n) { return String(n).padStart(2, '0') }

export default function BirthDatePicker({ value, onChange, disabled = false, yearsBack = 100 }) {
  // Stato locale per la bozza parziale (es. solo Giorno selezionato).
  // Il prop value e' "fully controlled" ma onChange emette '' quando la
  // data e' incompleta: senza stato locale, la selezione utente sarebbe
  // sovrascritta al re-render successivo. Conservandola qui, i 3 select
  // mantengono la scelta finche' l'utente non completa o non resetta.
  const [y, setY] = useState('')
  const [m, setM] = useState('')
  const [d, setD] = useState('')

  // Sync da value esterno: solo quando arriva una data ISO completa
  // valida (es. pre-fill in edit). Quando value e' '' o null non
  // tocchiamo il locale, altrimenti perderemmo la selezione utente in
  // corso (visto che noi stessi emettiamo onChange('') per stato parziale).
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [yy, mm, dd] = value.split('-')
      setY(yy); setM(mm); setD(dd)
    }
  }, [value])

  const currentYear = new Date().getFullYear()
  // Anni: corrente in alto, poi a scendere. Per data di nascita
  // l'anno "verosimile" e' tipicamente vicino all'anno corrente.
  const years = useMemo(() => {
    const arr = []
    for (let yyyy = currentYear; yyyy >= currentYear - yearsBack; yyyy--) arr.push(yyyy)
    return arr
  }, [currentYear, yearsBack])

  // Giorni 1..N adatti al mese/anno selezionato.
  const maxDay = daysInMonth(y, m)
  const days = useMemo(() => {
    const arr = []
    for (let dd = 1; dd <= maxDay; dd++) arr.push(dd)
    return arr
  }, [maxDay])

  function update(part, newVal) {
    let newY = y, newM = m, newD = d
    if (part === 'y') { newY = newVal; setY(newVal) }
    if (part === 'm') { newM = newVal; setM(newVal) }
    if (part === 'd') { newD = newVal; setD(newVal) }

    // Se cambiando mese/anno il giorno scelto supera i giorni del nuovo
    // mese (es. 31 → cambia a febbraio → 28/29), lo riporto al massimo
    // valido. Evita inconsistenze tipo "31/02".
    if ((part === 'm' || part === 'y') && newD) {
      const max = daysInMonth(newY, newM)
      if (Number(newD) > max) {
        newD = pad2(max)
        setD(newD)
      }
    }

    // Onchange emette 'YYYY-MM-DD' solo se tutti i campi sono settati;
    // altrimenti '' per segnalare "data incompleta" al chiamante. Lo
    // stato locale resta comunque popolato → la UI non perde la bozza.
    if (newY && newM && newD) {
      onChange(`${newY}-${pad2(newM)}-${pad2(newD)}`)
    } else {
      onChange('')
    }
  }

  const sel = {
    flex: 1,
    padding: '9px 8px',
    border: '0.5px solid #ccc',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    background: disabled ? '#f5f5f3' : '#fff',
    color: disabled ? '#888' : '#1a1a1a',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: disabled ? 'default' : 'pointer',
    minWidth: 0,    // permette al flex di stringere su mobile stretto
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select
        value={d}
        onChange={e => update('d', e.target.value)}
        disabled={disabled}
        aria-label="Giorno di nascita"
        style={sel}
      >
        <option value="">Giorno</option>
        {days.map(dd => (
          <option key={dd} value={pad2(dd)}>{dd}</option>
        ))}
      </select>

      <select
        value={m}
        onChange={e => update('m', e.target.value)}
        disabled={disabled}
        aria-label="Mese di nascita"
        style={sel}
      >
        <option value="">Mese</option>
        {MESI.map((nome, i) => (
          <option key={i + 1} value={pad2(i + 1)}>{nome}</option>
        ))}
      </select>

      <select
        value={y}
        onChange={e => update('y', e.target.value)}
        disabled={disabled}
        aria-label="Anno di nascita"
        style={sel}
      >
        <option value="">Anno</option>
        {years.map(yyyy => (
          <option key={yyyy} value={String(yyyy)}>{yyyy}</option>
        ))}
      </select>
    </div>
  )
}
