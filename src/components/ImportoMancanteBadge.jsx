// Badge giallo "Importo mancante": richiesta gia' inviata (o in attesa)
// ma senza importo_preventivo. Serve a non perdere il valore del
// preventivo per le statistiche e per il totale "in sospeso".
export default function ImportoMancanteBadge({ richiesta, compact = false }) {
  if (!richiesta) return null
  const pendente = richiesta.stato === 'inviato' || richiesta.stato === 'attesa'
  const manca = richiesta.importo_preventivo === null || richiesta.importo_preventivo === undefined
  if (!pendente || !manca) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999,
      fontSize: compact ? 11 : 12,
      fontWeight: 600,
      color: '#854F0B',
      background: '#FAEEDA',
      whiteSpace: 'nowrap',
    }}>
      Importo mancante
    </span>
  )
}
