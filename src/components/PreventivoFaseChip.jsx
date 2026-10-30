import { faseConversazione } from '../lib/preventivi'

// Chip che riassume a che punto e' lo scambio email con il cliente:
// "Il cliente ha risposto" / "Prima risposta inviata" / "Conversazione".
// Non renderizza nulla se la richiesta non ha messaggi tracciati.
export default function PreventivoFaseChip({ richiesta, compact = false }) {
  const f = faseConversazione(richiesta)
  if (!f) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999,
      fontSize: compact ? 11 : 12,
      fontWeight: 600,
      color: f.fg,
      background: f.bg,
      whiteSpace: 'nowrap',
    }}>
      {f.label}
    </span>
  )
}
