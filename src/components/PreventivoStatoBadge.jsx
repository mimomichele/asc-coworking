import { statoDi } from '../lib/preventivi'

// Pill colorato per lo stato di una richiesta preventivo.
// Nessuna logica, solo stile — coerente coi badge PassaLacqua.
export default function PreventivoStatoBadge({ stato, compact = false }) {
  const s = statoDi(stato)
  return (
    <span style={{
      display: 'inline-block',
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999,
      fontSize: compact ? 11 : 12,
      fontWeight: 600,
      color: s.fg,
      background: s.bg,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
