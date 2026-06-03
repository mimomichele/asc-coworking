// Launcher delle app ESTERNE (progetti separati: proprio Supabase/dominio/login).
// Solo link in nuova scheda, nessuna integrazione/route interna/DB.

const APPS = [
  { label: 'Compliance', url: 'https://asc-compliance.vercel.app', desc: 'Gestione adempimenti e conformità' },
  { label: 'Pulizie', url: 'https://gregarious-raindrop-4cea90.netlify.app', desc: 'Programmazione e check pulizie' },
  { label: 'Turni Bagnini', url: 'https://turni-bagnini.vercel.app', desc: 'Preferenze e turni bagnini' },
]

export default function LeMieApp() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Le mie app</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
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
              display: 'block', background: '#fff', border: '0.5px solid #e5e5e5',
              borderRadius: 12, padding: '18px 18px', textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 6 }}>
              {a.label} <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.6 }}>↗</span>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{a.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
