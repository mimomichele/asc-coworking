// ============================================================
// Preventivi > Nuova richiesta (manuale)
//
// Flusso rapido in due step:
//   1. Contatto: nome + email/telefono. Al blur su email/telefono
//      cerco un contatto esistente (per email oppure per
//      telefono_norm). Se trovato, mostro un box con lo storico
//      delle sue richieste e il pulsante "Usa questo contatto".
//      Altrimenti crea il contatto al salvataggio.
//   2. Dati richiesta: tipologia + canale (obbligatori), date,
//      persone, servizi, note.
// ============================================================

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  TIPOLOGIE, CANALI, SERVIZI,
  normalizzaTelefono, etichettaContatto, tipologiaLabel,
  fmtDataRange, fmtData, PREV_EVENTO_AGGIORNAMENTO,
} from '../../../lib/preventivi'
import PreventivoStatoBadge from '../../../components/PreventivoStatoBadge.jsx'

export default function NuovaRichiesta() {
  const navigate = useNavigate()
  const [contatto, setContatto] = useState({
    id: null,            // settato quando "Usa questo contatto"
    nome: '', cognome: '', societa_ente: '',
    email: '', telefono: '',
    consenso_marketing: false,
  })
  const [richiesta, setRichiesta] = useState({
    tipologia: 'famiglia', canale: 'telefono',
    data_arrivo: '', data_partenza: '',
    periodo_note: '', n_persone: '', n_accompagnatori: '',
    servizi: [], note: '',
  })
  const [matchContatto, setMatchContatto] = useState(null) // {dati, altre}
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Cerca contatto esistente per email o telefono. Lazy: ad ogni
  // blur, non ad ogni keystroke, per evitare query inutili.
  async function cercaContatto() {
    if (contatto.id) return
    const emailQ = contatto.email.trim().toLowerCase()
    const telNorm = normalizzaTelefono(contatto.telefono)
    if (!emailQ && !telNorm) { setMatchContatto(null); return }

    // match on email (citext → case-insensitive) OR on telefono_norm
    const or = [emailQ ? `email.eq.${emailQ}` : null,
                telNorm ? `telefono_norm.eq.${telNorm}` : null]
      .filter(Boolean).join(',')
    const { data } = await supabase
      .from('contatti')
      .select(`id, nome, cognome, societa_ente, email, telefono,
               altre:richieste_preventivo(id, tipologia, stato,
                 data_arrivo, data_partenza, data_ricevuta)`)
      .or(or)
      .limit(1)
      .maybeSingle()
    setMatchContatto(data || null)
  }

  function usaMatch() {
    if (!matchContatto) return
    setContatto({
      id: matchContatto.id,
      nome: matchContatto.nome || '',
      cognome: matchContatto.cognome || '',
      societa_ente: matchContatto.societa_ente || '',
      email: matchContatto.email || '',
      telefono: matchContatto.telefono || '',
      consenso_marketing: false,  // lo editi dalla scheda contatto
    })
    setMatchContatto(null)
  }

  async function salva() {
    setErr(''); setBusy(true)

    // Validazioni client
    if (!contatto.nome.trim()) { setErr('Nome obbligatorio.'); setBusy(false); return }
    if (!contatto.email.trim() && !contatto.telefono.trim()) {
      setErr('Serve almeno email o telefono per il contatto.'); setBusy(false); return
    }
    if (richiesta.data_arrivo && richiesta.data_partenza
        && richiesta.data_partenza < richiesta.data_arrivo) {
      setErr('La data di partenza non puo\' precedere l\'arrivo.'); setBusy(false); return
    }

    // 1. contatto
    let contattoId = contatto.id
    if (!contattoId) {
      const payload = {
        nome: contatto.nome.trim(),
        cognome: contatto.cognome.trim() || null,
        societa_ente: contatto.societa_ente.trim() || null,
        email: contatto.email.trim().toLowerCase() || null,
        telefono: contatto.telefono.trim() || null,
        consenso_marketing: !!contatto.consenso_marketing,
        consenso_marketing_data: contatto.consenso_marketing ? new Date().toISOString() : null,
      }
      const { data, error } = await supabase
        .from('contatti').insert(payload).select('id').single()
      if (error) {
        setBusy(false)
        setErr(error.code === '23505'
          ? 'Esiste già un contatto con questa email o telefono: cercalo in alto.'
          : `Creazione contatto: ${error.message}`)
        return
      }
      contattoId = data.id
    }

    // 2. richiesta
    const r = {
      contatto_id: contattoId,
      tipologia: richiesta.tipologia,
      canale: richiesta.canale,
      data_arrivo: richiesta.data_arrivo || null,
      data_partenza: richiesta.data_partenza || null,
      periodo_note: richiesta.periodo_note.trim() || null,
      n_persone: richiesta.n_persone === '' ? null : Number(richiesta.n_persone),
      n_accompagnatori: richiesta.n_accompagnatori === '' ? null : Number(richiesta.n_accompagnatori),
      servizi: richiesta.servizi,
      note: richiesta.note.trim() || null,
      stato: 'ricevuta',
    }
    const { data: nuova, error } = await supabase
      .from('richieste_preventivo').insert(r).select('id').single()
    setBusy(false)
    if (error) { setErr(`Creazione richiesta: ${error.message}`); return }
    window.dispatchEvent(new Event(PREV_EVENTO_AGGIORNAMENTO))
    navigate(`/admin/preventivi/richiesta/${nuova.id}`)
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Nuova richiesta</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 16 }}>
        Compila i dati del contatto e della richiesta. Le date possono
        essere lasciate vuote se non ancora precise.
      </div>

      {err && <div style={styles.errorBar}>{err}</div>}

      {/* Contatto */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Contatto</h3>
        {contatto.id && (
          <div style={styles.okBar}>
            Collegato a contatto esistente.
            <button className="btn-ghost" style={{ marginLeft: 10, fontSize: 12 }}
                    onClick={() => setContatto(c => ({ ...c, id: null }))}>
              Scollega
            </button>
          </div>
        )}

        <div style={styles.grid2}>
          <Campo label="Nome*">
            <input type="text" value={contatto.nome}
                   onChange={e => setContatto(c => ({ ...c, nome: e.target.value }))}
                   disabled={!!contatto.id} style={styles.input} />
          </Campo>
          <Campo label="Cognome">
            <input type="text" value={contatto.cognome}
                   onChange={e => setContatto(c => ({ ...c, cognome: e.target.value }))}
                   disabled={!!contatto.id} style={styles.input} />
          </Campo>
          <Campo label="Società / ente / gruppo" full>
            <input type="text" placeholder="es. ASD Virtus, IC Pascoli"
                   value={contatto.societa_ente}
                   onChange={e => setContatto(c => ({ ...c, societa_ente: e.target.value }))}
                   disabled={!!contatto.id} style={styles.input} />
          </Campo>
          <Campo label="Email">
            <input type="email" value={contatto.email}
                   onChange={e => setContatto(c => ({ ...c, email: e.target.value }))}
                   onBlur={cercaContatto}
                   disabled={!!contatto.id} style={styles.input} />
          </Campo>
          <Campo label="Telefono">
            <input type="tel" placeholder="+39..."
                   value={contatto.telefono}
                   onChange={e => setContatto(c => ({ ...c, telefono: e.target.value }))}
                   onBlur={cercaContatto}
                   disabled={!!contatto.id} style={styles.input} />
          </Campo>
        </div>

        {matchContatto && !contatto.id && (
          <div style={styles.matchBox}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <b>Contatto già in rubrica</b>: {etichettaContatto(matchContatto)}
              {matchContatto.email && ` · ${matchContatto.email}`}
              {matchContatto.telefono && ` · ${matchContatto.telefono}`}
            </div>
            {matchContatto.altre?.length > 0 && (
              <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>
                {matchContatto.altre.length} richiest{matchContatto.altre.length === 1 ? 'a' : 'e'} precedent{matchContatto.altre.length === 1 ? 'e' : 'i'}.
              </div>
            )}
            {(matchContatto.altre || []).slice(0, 3).map(a => (
              <div key={a.id} style={styles.rigaCompatta}>
                <PreventivoStatoBadge stato={a.stato} compact />
                <span style={{ fontSize: 12.5 }}>{tipologiaLabel(a.tipologia)}</span>
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                  {fmtDataRange(a.data_arrivo, a.data_partenza) || '—'}
                </span>
                <Link to={`/admin/preventivi/richiesta/${a.id}`}
                      style={{ fontSize: 12, color: '#185FA5', marginLeft: 'auto', textDecoration: 'none' }}>
                  apri →
                </Link>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button className="btn-primary" onClick={usaMatch}>Usa questo contatto</button>
              <button className="btn-ghost" onClick={() => setMatchContatto(null)}
                      style={{ marginLeft: 6 }}>
                No, è un contatto nuovo
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Richiesta */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={styles.sezione}>Richiesta</h3>
        <div style={styles.grid2}>
          <Campo label="Tipologia*">
            <select value={richiesta.tipologia}
                    onChange={e => setRichiesta(r => ({ ...r, tipologia: e.target.value }))}
                    style={styles.input}>
              {TIPOLOGIE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Canale*">
            <select value={richiesta.canale}
                    onChange={e => setRichiesta(r => ({ ...r, canale: e.target.value }))}
                    style={styles.input}>
              {CANALI.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Campo>
          <Campo label="Data arrivo">
            <input type="date" value={richiesta.data_arrivo}
                   onChange={e => setRichiesta(r => ({ ...r, data_arrivo: e.target.value }))}
                   style={styles.input} />
          </Campo>
          <Campo label="Data partenza">
            <input type="date" value={richiesta.data_partenza}
                   onChange={e => setRichiesta(r => ({ ...r, data_partenza: e.target.value }))}
                   style={styles.input} />
          </Campo>
          <Campo label="Periodo (se date non precise)" full>
            <input type="text" placeholder="es. fine giugno"
                   value={richiesta.periodo_note}
                   onChange={e => setRichiesta(r => ({ ...r, periodo_note: e.target.value }))}
                   style={styles.input} />
          </Campo>
          <Campo label="N. persone">
            <input type="number" min="0" value={richiesta.n_persone}
                   onChange={e => setRichiesta(r => ({ ...r, n_persone: e.target.value }))}
                   style={styles.input} />
          </Campo>
          <Campo label="N. accompagnatori">
            <input type="number" min="0" value={richiesta.n_accompagnatori}
                   onChange={e => setRichiesta(r => ({ ...r, n_accompagnatori: e.target.value }))}
                   style={styles.input} />
          </Campo>
          <Campo label="Servizi richiesti" full>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {SERVIZI.map(s => {
                const attivo = richiesta.servizi.includes(s.key)
                return (
                  <label key={s.key} style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={attivo}
                           onChange={() => setRichiesta(r => ({
                             ...r,
                             servizi: attivo
                               ? r.servizi.filter(x => x !== s.key)
                               : [...r.servizi, s.key],
                           }))} />{' '}
                    {s.label}
                  </label>
                )
              })}
            </div>
          </Campo>
          <Campo label="Note" full>
            <textarea rows={3} value={richiesta.note}
                      onChange={e => setRichiesta(r => ({ ...r, note: e.target.value }))}
                      style={{ ...styles.input, resize: 'vertical' }} />
          </Campo>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={salva} disabled={busy}>
          {busy ? 'Salvataggio…' : 'Crea richiesta'}
        </button>
        <Link to="/admin/preventivi" className="btn-ghost">Annulla</Link>
      </div>
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
  matchBox: {
    marginTop: 10, padding: 12,
    background: '#FFF8E1', border: '0.5px solid #F5B301', borderRadius: 7,
  },
  rigaCompatta: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
    padding: '5px 0', borderTop: '0.5px solid rgba(0,0,0,0.07)',
  },
  errorBar: {
    background: '#FCEBEB', color: '#C5221F', padding: '8px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 12,
  },
  okBar: {
    background: '#E6F6EF', color: '#1E8E3E', padding: '6px 12px',
    borderRadius: 6, fontSize: 13, marginBottom: 10, display: 'inline-flex',
    alignItems: 'center',
  },
}
