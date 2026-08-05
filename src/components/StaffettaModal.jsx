// ============================================================
// StaffettaModal — one-shot: chiede ai guest se nuoteranno alla
// staffetta di beneficenza "Passa l'Acqua" (12→13 settembre 2026).
//
// Regole di visibilità:
//   - solo fino al 13/09/2026 incluso (confronto su data LOCALE,
//     niente toISOString: bug timezone UTC+2 già noto nel progetto)
//   - solo se l'utente non ha già una riga in staffetta_adesioni
//   - non riappare nella stessa sessione dopo una chiusura senza
//     risposta (flag in sessionStorage), riappare alla prossima
//   - resta nascosto finché il check sul DB non è completato
//
// La risposta usa upsert su user_id (UNIQUE): un doppio click o una
// seconda scheda non generano errore 23505. Richiede la policy
// staffetta_update_own, già presente.
//
// Montato in GuestLayout: solo i guest lo raggiungono (admin,
// rosticceria e dipendente hanno layout separati) e non viene
// rimontato ai cambi di route interni.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DISMISS_KEY = 'staffetta_dismissed'

// Ultimo giorno di visibilità (incluso). Mese 0-based: 8 = settembre.
const DEADLINE = { y: 2026, m: 8, d: 13 }

function isPastDeadline() {
  const now = new Date()
  if (now.getFullYear() !== DEADLINE.y) return now.getFullYear() > DEADLINE.y
  if (now.getMonth() !== DEADLINE.m) return now.getMonth() > DEADLINE.m
  return now.getDate() > DEADLINE.d
}

// Icone Lucide incorporate inline (path ufficiali) per non aggiungere
// la dipendenza lucide-react solo per tre icone.
function Icon({ name, size = 19, color = '#F5C200' }) {
  const paths = {
    calendar: (
      <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </>
    ),
    mapPin: (
      <>
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    waves: (
      <>
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none', marginTop: 2 }}
    >
      {paths[name]}
    </svg>
  )
}

export default function StaffettaModal({ session }) {
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Check iniziale: niente flash — visible parte false e diventa true
  // solo se la query conferma che l'utente non ha ancora risposto.
  useEffect(() => {
    if (isPastDeadline()) return
    if (sessionStorage.getItem(DISMISS_KEY)) return
    let alive = true
    supabase
      .from('staffetta_adesioni')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { console.error('[StaffettaModal check]', error); return }
        if (!data) setVisible(true)
      })
    return () => { alive = false }
  }, [session.user.id])

  // ESC chiude (come X e backdrop). Listener registrato solo mentre il
  // modal è visibile e rimosso nel cleanup.
  useEffect(() => {
    if (!visible) return
    function onKey(e) { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, saving]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chiusura senza risposta: nessuna scrittura DB, solo flag di sessione.
  function dismiss() {
    if (saving) return
    sessionStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function answer(nuotera) {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('staffetta_adesioni')
      .upsert({ user_id: session.user.id, nuotera }, { onConflict: 'user_id' })
    if (error) {
      console.error('[StaffettaModal upsert]', error)
      setError('Salvataggio non riuscito. Controlla la connessione e riprova.')
      setSaving(false)
    } else {
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div
      style={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div style={styles.modal} role="dialog" aria-modal="true" aria-label="Staffetta Passa l'Acqua">

        {/* header nero */}
        <div style={styles.header}>
          <button onClick={dismiss} aria-label="Chiudi" style={styles.closeBtn}>✕</button>
          <div style={styles.title}>PASSA L&rsquo;ACQUA</div>
          <div style={styles.subtitle}>24 ore di staffetta di nuoto per il Calcit</div>
          <div style={styles.tagline}>Passa l&rsquo;acqua a chi viene dopo</div>
        </div>

        {/* corpo bianco */}
        <div style={styles.body}>
          <div style={styles.row}>
            <Icon name="calendar" />
            <div>
              <div style={styles.rowTitle}>sabato 12 → domenica 13 settembre 2026</div>
              <div style={styles.rowSub}>dalle 10:00 alle 10:00</div>
            </div>
          </div>
          <div style={styles.row}>
            <Icon name="mapPin" />
            <div>
              <div style={styles.rowTitle}>Piscina ASC Hotel</div>
              <div style={styles.rowSub}>via di Castelsecco 8/h</div>
            </div>
          </div>
          <div style={styles.row}>
            <Icon name="waves" />
            <div>
              <div style={styles.rowTitle}>Nuota quanto vuoi</div>
              <div style={styles.rowSub}>5 minuti o 5 ore, come te la senti</div>
            </div>
          </div>

          <div style={styles.band}>L&rsquo;intero ricavato sarà devoluto al Calcit</div>

          <div style={styles.sep} />

          <div style={styles.question}>Scenderai in acqua?</div>
          <div style={styles.questionSub}>Ci serve solo per stimare quanti nuotatori saremo</div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.btnRow}>
            <button
              onClick={() => answer(true)}
              disabled={saving}
              style={{ ...styles.btnYes, ...(saving ? styles.btnDisabled : {}) }}
            >
              Sì, nuoterò
            </button>
            <button
              onClick={() => answer(false)}
              disabled={saving}
              style={{ ...styles.btnNo, ...(saving ? styles.btnDisabled : {}) }}
            >
              No, questa volta no
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    width: '100%', maxWidth: 430,
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    position: 'relative', background: '#1a1a1a',
    padding: '26px 24px 20px', textAlign: 'left',
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)',
    fontSize: 18, cursor: 'pointer', padding: 6, lineHeight: 1,
  },
  title: {
    color: '#F5C200', fontSize: 27, fontWeight: 500,
    letterSpacing: 1, marginBottom: 6,
  },
  subtitle: { color: '#fff', fontSize: 12.5, fontWeight: 500 },
  tagline: {
    color: 'rgba(255,255,255,0.6)', fontStyle: 'italic',
    fontSize: 12, marginTop: 2,
  },
  body: { padding: '18px 20px 20px' },
  row: { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 13 },
  rowTitle: { color: '#1a1a1a', fontSize: 14, fontWeight: 500 },
  rowSub: { color: '#888', fontSize: 12.5, marginTop: 1 },
  band: {
    background: '#F5C200', color: '#1a1a1a', borderRadius: 10,
    padding: '10px 14px', textAlign: 'center',
    fontSize: 13, fontWeight: 500, marginTop: 16,
  },
  sep: { borderTop: '0.5px solid #e5e5e5', margin: '16px 0' },
  question: { textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#1a1a1a' },
  questionSub: { textAlign: 'center', fontSize: 12.5, color: '#888', marginTop: 3 },
  error: {
    textAlign: 'center', color: '#b42318', fontSize: 12.5, marginTop: 10,
  },
  btnRow: { display: 'flex', gap: 10, marginTop: 16 },
  btnYes: {
    flex: 1, background: '#1a1a1a', color: '#F5C200', border: 'none',
    borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 500,
    cursor: 'pointer',
  },
  btnNo: {
    flex: 1, background: '#fff', color: '#1a1a1a',
    border: '0.5px solid #ccc',
    borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 500,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.55, cursor: 'default' },
}
