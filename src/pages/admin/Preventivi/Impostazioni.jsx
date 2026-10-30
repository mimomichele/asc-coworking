// ============================================================
// Preventivi > Impostazioni
//
// Due blocchi editabili:
//   1. Soglie follow-up per tipologia (preventivi_impostazioni
//      chiave 'follow_up_giorni')
//   2. Template di risposta per tipologia (template_risposta,
//      3 righe — una per tipologia).
//
// Tutti i segnaposto [PREZZO ...] e gli altri placeholder vanno
// scritti dall'utente nel template. L'edge function li mantiene
// intatti o li sostituisce coi dati estratti.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { TIPOLOGIE, tipologiaLabel } from '../../../lib/preventivi'

const DEFAULT_SOGLIE = { raduno: 7, scuola: 14, famiglia: 3 }

export default function Impostazioni() {
  const [soglie, setSoglie] = useState(DEFAULT_SOGLIE)
  const [soglieDirty, setSoglieDirty] = useState(false)
  const [template, setTemplate] = useState({})      // {tipologia: {oggetto, corpo}}
  const [templateDirty, setTemplateDirty] = useState({})
  const [err, setErr] = useState('')
  const [salva, setSalva] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setErr('')
    const [{ data: imp }, { data: tpls }] = await Promise.all([
      supabase.from('preventivi_impostazioni')
        .select('value').eq('key', 'follow_up_giorni').maybeSingle(),
      supabase.from('template_risposta')
        .select('tipologia, oggetto_template, corpo_template'),
    ])
    setSoglie({ ...DEFAULT_SOGLIE, ...(imp?.value || {}) })
    const map = {}
    for (const t of tpls || []) {
      map[t.tipologia] = {
        oggetto: t.oggetto_template, corpo: t.corpo_template,
      }
    }
    setTemplate(map)
    setLoading(false)
  }

  function flash(txt = 'Salvato') {
    setSalva(txt); setTimeout(() => setSalva(null), 2000)
  }

  async function salvaSoglie() {
    setBusy(true); setErr('')
    const value = {}
    for (const t of TIPOLOGIE) {
      const n = Number(soglie[t.key])
      value[t.key] = Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_SOGLIE[t.key]
    }
    const { error } = await supabase
      .from('preventivi_impostazioni')
      .upsert({ key: 'follow_up_giorni', value, updated_at: new Date().toISOString() },
              { onConflict: 'key' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSoglie(value); setSoglieDirty(false); flash()
  }

  async function salvaTemplate(tip) {
    const t = template[tip]
    if (!t) return
    const user = (await supabase.auth.getUser()).data.user
    setBusy(true); setErr('')
    const { error } = await supabase
      .from('template_risposta')
      .upsert({
        tipologia: tip,
        oggetto_template: t.oggetto,
        corpo_template: t.corpo,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tipologia' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setTemplateDirty(d => ({ ...d, [tip]: false }))
    flash()
  }

  function cambiaTemplate(tip, chiave, valore) {
    setTemplate(m => ({ ...m, [tip]: { ...(m[tip] || {}), [chiave]: valore } }))
    setTemplateDirty(d => ({ ...d, [tip]: true }))
  }

  if (loading) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Impostazioni preventivi</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 16 }}>
        Soglie follow-up e template di risposta per tipologia.
      </div>

      {err && <div style={styles.errorBar}>{err}</div>}
      {salva && <div style={styles.okBar}>{salva}</div>}

      {/* Soglie */}
      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={styles.sezione}>Soglie follow-up (giorni dall'ultimo contatto)</h3>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10 }}>
          Oltre questi giorni, la richiesta compare in "Da ricontattare" nella tab Oggi.
        </div>
        <div style={styles.grid3}>
          {TIPOLOGIE.map(t => (
            <div key={t.key}>
              <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 3 }}>{t.label}</div>
              <input type="number" min="1" max="365"
                     value={soglie[t.key] ?? ''}
                     onChange={e => {
                       setSoglie(s => ({ ...s, [t.key]: Number(e.target.value) }))
                       setSoglieDirty(true)
                     }}
                     style={styles.input} />
            </div>
          ))}
        </div>
        {soglieDirty && (
          <div style={{ marginTop: 10 }}>
            <button className="btn-primary" onClick={salvaSoglie} disabled={busy}>
              Salva soglie
            </button>
          </div>
        )}
      </section>

      {/* Template */}
      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={styles.sezione}>Template di risposta</h3>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10 }}>
          Segnaposto utilizzabili: <code>[NOME]</code>, <code>[COGNOME]</code>, <code>[NOME_GRUPPO]</code>,
          {' '}<code>[DATE]</code>, <code>[N_PERSONE]</code>, <code>[N_ACCOMPAGNATORI]</code>,
          {' '}<code>[SERVIZI]</code>, <code>[VALIDITA]</code>.
          I prezzi vanno sempre lasciati come <code>[PREZZO notte]</code>, <code>[PREZZO pasto]</code>, <code>[PREZZO piscina]</code>:
          l'AI non li inventa mai.
        </div>

        {TIPOLOGIE.map(t => {
          const curr = template[t.key] || { oggetto: '', corpo: '' }
          const dirty = templateDirty[t.key]
          return (
            <div key={t.key} style={{ marginTop: 14, paddingTop: 14,
                                       borderTop: '0.5px solid #E5E3DC' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 3 }}>Oggetto</div>
              <input type="text" value={curr.oggetto}
                     onChange={e => cambiaTemplate(t.key, 'oggetto', e.target.value)}
                     style={{ ...styles.input, marginBottom: 10 }} />
              <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 3 }}>Corpo</div>
              <textarea rows={10} value={curr.corpo}
                        onChange={e => cambiaTemplate(t.key, 'corpo', e.target.value)}
                        style={{ ...styles.input, resize: 'vertical',
                                 fontFamily: 'inherit' }} />
              {dirty && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn-primary" onClick={() => salvaTemplate(t.key)} disabled={busy}>
                    Salva template {t.label.toLowerCase()}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

const styles = {
  sezione: { fontSize: 14, fontWeight: 600, color: '#111', marginTop: 0, marginBottom: 10 },
  grid3: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  },
  input: {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
    boxSizing: 'border-box',
  },
  errorBar: {
    background: '#FCEBEB', color: '#C5221F', padding: '8px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10,
  },
  okBar: {
    background: '#E6F6EF', color: '#1E8E3E', padding: '6px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10,
    display: 'inline-flex', alignItems: 'center',
  },
}
