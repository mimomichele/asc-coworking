// Launcher delle app ESTERNE (progetti separati: proprio Supabase/dominio/login).
// Solo link in nuova scheda, nessuna integrazione/route interna/DB.

// Regola ASC-DESIGN: ogni card ha emoji, titolo, descrizione di una riga
// e apre in nuova scheda con ↗. Le app esterne vivono SOLO qui.
const APPS = [
  { emoji: '🔧', label: 'Manutenzione', url: 'https://hotel-manutenzione.vercel.app', desc: 'Segnalazione guasti e interventi' },
  { emoji: '🧹', label: 'Pulizie', url: 'https://gregarious-raindrop-4cea90.netlify.app', desc: 'Programmazione e check pulizie' },
  { emoji: '🥐', label: 'Colazioni', url: 'https://hotel-colazioni.vercel.app', desc: 'Gestione colazioni e presenze' },
  { emoji: '🛟', label: 'Turni Bagnini', url: 'https://turni-bagnini.vercel.app', desc: 'Preferenze e turni bagnini' },
  { emoji: '🍹', label: 'Honesty Bar', url: 'https://asc-honesty-bar.vercel.app/admin', desc: 'Bar self-service: addebiti e incassi' },
  { emoji: '🍽️', label: 'Ristorante', url: 'https://ristorante.aschotel.com', desc: 'Gestionale del ristorante' },
]

export default function LeMieApp() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Le mie app</h2>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>
        App esterne — si aprono in una nuova scheda.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {APPS.map(a => (
          <a
            key={a.label}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', background: '#fff', border: '0.5px solid #E5E3DC',
              borderRadius: 12, padding: '18px 18px', textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111111', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ fontSize: 20 }}>{a.emoji}</span>
              {a.label} <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.6 }}>↗</span>
            </div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>{a.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
