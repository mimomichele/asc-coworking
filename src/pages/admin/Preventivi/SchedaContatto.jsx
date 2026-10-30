// ============================================================
// Preventivi > scheda contatto
//
// Editing dei dati base, consenso marketing (con data), elenco
// delle richieste collegate. Se email/telefono (normalizzato)
// corrispondono anche a un member coworking, mostra avviso +
// link alla scheda ospite (nessun merge automatico).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  tipologiaLabel, fmtData, fmtDataRange, fmtEuro,
  etichettaContatto, normalizzaTelefono,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'

export default function SchedaContatto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [edits, setEdits] = useState({})
  const [matchCow, setMatchCow] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [salva, setSalva] = useState(null)

  useEffect(() => { fetchContatto() }, [id])

  async function fetchContatto() {
    setErr('')
    const { data, error } = await supabase
      .from('contatti')
      .select(`*,
               richieste:richieste_preventivo(id, tipologia, stato,
                 data_arrivo, data_partenza, data_ricevuta, importo_preventivo)`)
      .eq('id', id).maybeSingle()
    if (error) { setErr('Errore nel caricamento.'); return }
    if (!data) { setErr('Contatto non trovato.'); return }
    setC(data)
    setEdits({})
    // Match su members coworking: cerca per email o telefono (members
    // ha owner_id → auth.users, qui controlliamo accounts.phone/email).
    cercaCoworking(data)
  }

  async function cercaCoworking(contatto) {
    const email = contatto.email?.toLowerCase()?.trim()
    const telN  = normalizzaTelefono(contatto.telefono)
    if (!email && !telN) { setMatchCow(null); return }
    // "accounts" ha phone e (via auth.users) email: provo prima per
    // phone, che e' direttamente in tabella.
    const phoneRaw = (contatto.telefono || '').replace(/\D/g, '')
    if (!phoneRaw) { setMatchCow(null); return }
    const last = phoneRaw.slice(-9)   // match tollerante sul suffisso
    const { data } = await supabase
      .from('accounts')
      .select('id, name, surname')
      .ilike('phone', `%${last}`)
      .limit(1)
      .maybeSingle()
    setMatchCow(data || null)
  }

  function cambia(k, v) { setEdits(e => ({ ...e, [k]: v })) }

  async function salvaTutti() {
    if (Object.keys(edits).length === 0) return
    setBusy(true); setErr('')
    // consenso: se diventa true e prima era false, timestampa; se
    // diventa false, azzeriamo anche la data (coerenza).
    const payload = { ...edits }
    if ('consenso_marketing' in edits) {
      if (edits.consenso_marketing && !c.consenso_marketing) {
        payload.consenso_marketing_data = new Date().toISOString()
      } else if (!edits.consenso_marketing) {
        payload.consenso_marketing_data = null
      }
    }
    const { error } = await supabase
      .from('contatti').update(payload).eq('id', id).select('id')
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSalva('Salvato')
    setTimeout(() => setSalva(null), 2000)
    fetchContatto()
  }

  async function collegaCoworking(memberId) {
    const ok = window.confirm('Collego questo contatto al membro coworking selezionato?')
    if (!ok) return
    const { error } = await supabase
      .from('contatti').update({ member_id: memberId }).eq('id', id)
    if (error) { setErr(error.message); return }
    fetchContatto()
  }

  const richieste = useMemo(() => {
    if (!c?.richieste) return []
    return [...c.richieste].sort((a, b) =>
      (b.data_ricevuta || '').localeCompare(a.data_ricevuta || ''))
  }, [c])

  if (err && !c) return (
    <div style={{ padding: 20 }}>
      <div>{err}</div>
      <Link to="/admin/preventivi/contatti" className="btn-ghost"
            style={{ marginTop: 12, display: 'inline-block' }}>← Torna</Link>
    </div>
  )
  if (!c) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  const dirty = Object.keys(edits).length > 0

  return (
    <div>
      <Link to="/admin/preventivi/contatti"
            style={{ fontSize: 13, color: '#6B6B6B', textDecoration: 'none' }}>
        ← Contatti
      </Link>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, marginTop: 6 }}>
        {etichettaContatto(c)}
      </h2>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 16 }}>
        Creato il {fmtData(c.created_at?.slice(0, 10))}
      </div>

      {err && <div style={styles.errorBar}>{err}</div>}
      {salva && <div style={styles.okBar}>{salva}</div>}

      {matchCow && !c.member_id && (
        <div style={styles.warnBox}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <b>Possibile corrispondenza</b> col coworking:{' '}
            <Link to={`/admin/ospiti/${matchCow.id}`}
                  style={{ color: '#185FA5' }}>
              {matchCow.name} {matchCow.surname}
            </Link>
          </div>
          <button className="btn-ghost" onClick={() => collegaCoworking(matchCow.id)}>
            Collega a questo membro
          </button>
        </div>
      )}

      {c.member_id && (
        <div style={styles.okBar}>
          Collegato al coworking.
          <button className="btn-ghost" style={{ marginLeft: 10, fontSize: 12 }}
                  onClick={async () => {
                    await supabase.from('contatti').update({ member_id: null }).eq('id', id)
                    fetchContatto()
                  }}>
            Scollega
          </button>
        </div>
      )}

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Anagrafica</h3>
        <div style={styles.grid2}>
          <Campo label="Nome*">
            <input type="text" value={edits.nome ?? c.nome ?? ''}
                   onChange={e => cambia('nome', e.target.value)}
                   style={styles.input} />
          </Campo>
          <Campo label="Cognome">
            <input type="text" value={edits.cognome ?? c.cognome ?? ''}
                   onChange={e => cambia('cognome', e.target.value || null)}
                   style={styles.input} />
          </Campo>
          <Campo label="Società / ente" full>
            <input type="text" value={edits.societa_ente ?? c.societa_ente ?? ''}
                   onChange={e => cambia('societa_ente', e.target.value || null)}
                   style={styles.input} />
          </Campo>
          <Campo label="Email">
            <input type="email" value={edits.email ?? c.email ?? ''}
                   onChange={e => cambia('email', (e.target.value || '').toLowerCase() || null)}
                   style={styles.input} />
          </Campo>
          <Campo label="Telefono">
            <input type="tel" value={edits.telefono ?? c.telefono ?? ''}
                   onChange={e => cambia('telefono', e.target.value || null)}
                   style={styles.input} />
          </Campo>
          <Campo label="Consenso marketing" full>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox"
                     checked={edits.consenso_marketing ?? c.consenso_marketing}
                     onChange={e => cambia('consenso_marketing', e.target.checked)} />{' '}
              Autorizza comunicazioni promozionali
            </label>
            {c.consenso_marketing && c.consenso_marketing_data && (
              <div style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 4 }}>
                Dato il {fmtData(c.consenso_marketing_data.slice(0, 10))}
              </div>
            )}
          </Campo>
        </div>
        {dirty && (
          <div style={{ marginTop: 10 }}>
            <button className="btn-primary" onClick={salvaTutti} disabled={busy}>
              Salva modifiche
            </button>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Richieste collegate ({richieste.length})</h3>
        {richieste.length === 0 ? (
          <div style={{ fontSize: 13, color: '#6B6B6B' }}>Nessuna richiesta.</div>
        ) : richieste.map(r => (
          <Link key={r.id} to={`/admin/preventivi/richiesta/${r.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={styles.rigaCompatta}>
              <PreventivoStatoBadge stato={r.stato} compact />
              <span style={{ fontSize: 12.5 }}>{tipologiaLabel(r.tipologia)}</span>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                {fmtDataRange(r.data_arrivo, r.data_partenza) || '—'}
              </span>
              {r.importo_preventivo != null && (
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                  {fmtEuro(r.importo_preventivo)}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
                ricevuta {fmtData(r.data_ricevuta?.slice(0, 10))}
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}

function Campo({ label, children, full = false }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}

const styles = {
  sezione: { fontSize: 14, fontWeight: 600, color: '#111', marginTop: 0, marginBottom: 10 },
  grid2: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  input: {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '0.5px solid #ccc', borderRadius: 7, background: '#fff',
    boxSizing: 'border-box',
  },
  rigaCompatta: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
    padding: '6px 0', borderTop: '0.5px solid #eee',
  },
  warnBox: {
    padding: 12, marginBottom: 10,
    background: '#FFF8E1', border: '0.5px solid #F5B301', borderRadius: 7,
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
