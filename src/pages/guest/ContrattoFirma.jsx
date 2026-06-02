// ============================================================
// Schermata firma obbligatoria del contratto di membership.
// Renderizzata a tutta pagina da App.jsx quando il guest non ha
// ancora firmato (gating: role==='guest' && hasSigned===false,
// dopo il check di accountAttivo).
//
// Flusso:
//   1. fetch contratto (titolo + body con placeholder {{...}})
//   2. fetch account dell'ospite (per pre-compilare nome/cognome)
//   3. fetch member intestatario (oldest: per pre-compilare dati gia'
//      eventualmente valorizzati e renderli read-only)
//   4. render del contratto col body in cui i placeholder si
//      sostituiscono live coi valori della form (anteprima)
//   5. form 5 campi + 2 checkbox + bottone Accetto
//   6. submit -> signContract() -> onSigned() per re-fetch in App.jsx
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  fetchContract,
  signContract,
  validateItalianCF,
  CF_REGEX,
} from '../../lib/contract'

const emptyForm = {
  luogo_nascita: '',
  data_nascita: '',
  residenza: '',
  codice_fiscale: '',
  numero_documento: '',
}

export default function ContrattoFirma({ session, onSigned }) {
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const [contract, setContract] = useState(null)   // { title, body }
  const [account, setAccount]   = useState(null)   // { name, surname }
  // Pre-compilati dal DB: se non vuoti, i corrispondenti input
  // sono read-only (regola: "campi gia' nel profilo → non modificabili").
  const [locked, setLocked] = useState({
    luogo_nascita: false,
    data_nascita: false,
    residenza: false,
    codice_fiscale: false,
    numero_documento: false,
  })

  const [form, setForm]   = useState(emptyForm)
  const [ack1, setAck1]   = useState(false)
  const [ack2, setAck2]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr]   = useState('')

  // -- Caricamento iniziale: contratto + account + head member --
  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setLoadErr('')
    // 1. contratto
    const c = await fetchContract()
    if (c.error) { setLoadErr(c.error); setLoading(false); return }
    setContract(c.data)

    // 2. account dell'utente loggato
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .select('id, name, surname')
      .eq('owner_id', session.user.id)
      .maybeSingle()
    if (accErr) { setLoadErr(accErr.message); setLoading(false); return }
    if (!acc)   { setLoadErr('Account non trovato per questo utente'); setLoading(false); return }
    setAccount(acc)

    // 3. head member: il piu' vecchio per account_id
    //    (stesso criterio usato dalla Edge Function sign-contract)
    const { data: mem, error: memErr } = await supabase
      .from('members')
      .select('id, luogo_nascita_testo, data_nascita, residenza, codice_fiscale, numero_documento')
      .eq('account_id', acc.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (memErr) { setLoadErr(memErr.message); setLoading(false); return }
    if (!mem)   { setLoadErr('Membro intestatario non trovato'); setLoading(false); return }

    // Pre-compila i 5 campi dai valori esistenti su members; quelli
    // gia' valorizzati saranno read-only (regola del piano).
    const initialForm = {
      luogo_nascita:    mem.luogo_nascita_testo || '',
      data_nascita:     mem.data_nascita || '',
      residenza:        mem.residenza || '',
      codice_fiscale:   mem.codice_fiscale || '',
      numero_documento: mem.numero_documento || '',
    }
    setForm(initialForm)
    setLocked({
      luogo_nascita:    !!initialForm.luogo_nascita,
      data_nascita:     !!initialForm.data_nascita,
      residenza:        !!initialForm.residenza,
      codice_fiscale:   !!initialForm.codice_fiscale,
      numero_documento: !!initialForm.numero_documento,
    })

    setLoading(false)
  }

  // -- Anteprima dinamica del body: i placeholder si sostituiscono
  // coi valori della form in tempo reale (anche con label "[da
  // compilare]" se vuoti). DATA_FIRMA e' sempre "[in fase di firma]"
  // perche' la timbra la Edge Function al momento dell'invio. --
  const filledBody = useMemo(() => {
    if (!contract?.body || !account) return ''
    const nomeCognome = `${account.name} ${account.surname}`.trim()
    const subs = {
      NOME_COGNOME:     nomeCognome || '[Nome e cognome]',
      LUOGO_NASCITA:    form.luogo_nascita.trim() || '[Luogo di nascita]',
      DATA_NASCITA:     fmtDateIT(form.data_nascita) || '[Data di nascita]',
      RESIDENZA:        form.residenza.trim() || '[Residenza]',
      CODICE_FISCALE:   form.codice_fiscale.trim().toUpperCase() || '[Codice fiscale]',
      NUMERO_DOCUMENTO: form.numero_documento.trim() || '[Numero documento]',
      DATA_FIRMA:       '[da compilare alla firma]',
    }
    let out = contract.body
    for (const [k, v] of Object.entries(subs)) {
      out = out.split(`{{${k}}}`).join(v)
    }
    return out
  }, [contract, account, form])

  // -- Validita' del form per abilitare il bottone Accetto --
  const cfTrim = form.codice_fiscale.trim()
  const cfWarnsItalian = cfTrim.length > 0 && !validateItalianCF(cfTrim)
  const allFilled =
    !!form.luogo_nascita.trim() &&
    !!form.data_nascita &&
    !!form.residenza.trim() &&
    cfTrim.length >= 4 &&
    !!form.numero_documento.trim()
  const canSubmit = allFilled && ack1 && ack2 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitErr('')
    const { data, error } = await signContract({
      luogo_nascita:    form.luogo_nascita.trim(),
      data_nascita:     form.data_nascita,
      residenza:        form.residenza.trim(),
      codice_fiscale:   form.codice_fiscale.trim().toUpperCase(),
      numero_documento: form.numero_documento.trim(),
    })
    if (error) {
      setSubmitErr(error)
      setSubmitting(false)
      return
    }
    // Successo: il parent re-fetcha lo stato e passa al GuestLayout.
    onSigned()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={S.page}>
      <Header onLogout={logout} />
      <main style={S.main}>
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>Caricamento contratto…</div>
      </main>
    </div>
  )

  if (loadErr) return (
    <div style={S.page}>
      <Header onLogout={logout} />
      <main style={S.main}>
        <div style={S.errorBlock}>
          Impossibile caricare il contratto: {loadErr}
        </div>
      </main>
    </div>
  )

  return (
    <div style={S.page}>
      <Header onLogout={logout} />

      <main style={S.main}>
        <h1 style={S.h1}>{contract.title}</h1>
        <p style={S.intro}>
          Per accedere ai servizi (coworking, piscina, rosticceria) è necessario
          leggere e firmare il contratto di membership. Compila i dati anagrafici
          richiesti, conferma con le due dichiarazioni e premi <strong>Accetto</strong>.
        </p>

        {/* Testo del contratto */}
        <section style={S.cardContract}>
          {filledBody.split('\n').map((raw, i) => {
            const line = raw.replace(/\s+$/u, '')
            if (line === '') return <div key={i} style={{ height: 8 }} />
            const isHeader =
              /^Art\.\s/.test(line) ||
              /^premesso$/i.test(line) ||
              /^Tra$/i.test(line) ||
              /^e$/i.test(line) ||
              /^si conviene/i.test(line)
            return (
              <p key={i} style={isHeader ? S.contractHeader : S.contractLine}>
                {line}
              </p>
            )
          })}
        </section>

        {/* Dati anagrafici */}
        <section style={S.cardForm}>
          <h3 style={S.h3}>I tuoi dati</h3>
          <p style={S.formHint}>
            I campi già presenti nel sistema sono pre-compilati e bloccati.
            Compila quelli mancanti.
          </p>

          <div style={S.grid2}>
            <Field label="Nome">
              <input value={account.name} readOnly style={S.input(true)} />
            </Field>
            <Field label="Cognome">
              <input value={account.surname} readOnly style={S.input(true)} />
            </Field>

            <Field label="Luogo di nascita" required={!locked.luogo_nascita}>
              <input
                type="text"
                value={form.luogo_nascita}
                onChange={e => setForm(f => ({ ...f, luogo_nascita: e.target.value }))}
                readOnly={locked.luogo_nascita}
                placeholder="es. Arezzo"
                style={S.input(locked.luogo_nascita)}
              />
            </Field>
            <Field label="Data di nascita" required={!locked.data_nascita}>
              <input
                type="date"
                value={form.data_nascita}
                onChange={e => setForm(f => ({ ...f, data_nascita: e.target.value }))}
                readOnly={locked.data_nascita}
                style={S.input(locked.data_nascita)}
              />
            </Field>

            <Field label="Residenza" required={!locked.residenza} colSpan>
              <input
                type="text"
                value={form.residenza}
                onChange={e => setForm(f => ({ ...f, residenza: e.target.value }))}
                readOnly={locked.residenza}
                placeholder="es. Via Roma 12, 52100 Arezzo (AR)"
                style={S.input(locked.residenza)}
              />
            </Field>

            <Field label="Codice fiscale" required={!locked.codice_fiscale}>
              <input
                type="text"
                value={form.codice_fiscale}
                onChange={e => setForm(f => ({ ...f, codice_fiscale: e.target.value.toUpperCase() }))}
                readOnly={locked.codice_fiscale}
                maxLength={16}
                placeholder="RSSMRA80A01H501U"
                style={{
                  ...S.input(locked.codice_fiscale),
                  ...(cfWarnsItalian ? { borderColor: '#E24B4A' } : null),
                }}
              />
              {cfWarnsItalian && !locked.codice_fiscale && (
                <div style={S.warn}>
                  Formato CF italiano non valido (16 caratteri).
                  Per CF stranieri/temporanei ignora questo avviso.
                </div>
              )}
            </Field>
            <Field label="Numero documento" required={!locked.numero_documento}>
              <input
                type="text"
                value={form.numero_documento}
                onChange={e => setForm(f => ({ ...f, numero_documento: e.target.value }))}
                readOnly={locked.numero_documento}
                placeholder="es. CA12345AB"
                style={S.input(locked.numero_documento)}
              />
            </Field>
          </div>
        </section>

        {/* Dichiarazioni */}
        <section style={S.cardAck}>
          <label style={S.ackRow}>
            <input
              type="checkbox"
              checked={ack1}
              onChange={e => setAck1(e.target.checked)}
              style={S.checkbox}
            />
            <span>Dichiaro di aver letto e di accettare il contratto di membership.</span>
          </label>
          <label style={S.ackRow}>
            <input
              type="checkbox"
              checked={ack2}
              onChange={e => setAck2(e.target.checked)}
              style={S.checkbox}
            />
            <span>
              Ai sensi degli artt. 1341 e 1342 c.c., approvo specificamente le clausole
              degli articoli <strong>4</strong> (accesso piscina e sicurezza),
              <strong> 6</strong> (responsabilità del Member),
              <strong> 7</strong> (sospensione e recesso senza rimborso),
              <strong> 10</strong> (foro competente).
            </span>
          </label>
        </section>

        {submitErr && (
          <div style={S.errorBlock}>{submitErr}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            ...S.btnAccept,
            opacity: canSubmit ? 1 : 0.45,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Firma in corso…' : 'Accetto e firmo'}
        </button>

        <p style={S.footnote}>
          Premendo "Accetto" verrà generato un PDF del contratto compilato coi tuoi
          dati e archiviato. Potrai scaricarlo dalla tua scheda in qualunque momento.
        </p>
      </main>
    </div>
  )
}

// ============================================================
// Sotto-componenti e stili
// ============================================================
function Header({ onLogout }) {
  return (
    <nav style={S.topnav}>
      <div style={S.logo}>
        ASC <span style={{ color: '#F5C842' }}>HOTEL</span>
        <span style={S.topLabel}>Contratto di membership</span>
      </div>
      <button onClick={onLogout} style={S.logoutBtn}>Esci</button>
    </nav>
  )
}

function Field({ label, required, colSpan, children }) {
  return (
    <div style={{ ...(colSpan ? { gridColumn: '1/-1' } : null) }}>
      <label style={S.label}>{label}{required ? ' *' : ''}</label>
      {children}
    </div>
  )
}

// Formatta YYYY-MM-DD → GG/MM/AAAA (usato nell'anteprima del body)
function fmtDateIT(iso) {
  if (!iso || typeof iso !== 'string') return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

const S = {
  page: { minHeight: '100vh', background: '#f5f5f3' },
  topnav: {
    background: '#1a1a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 54,
    position: 'sticky', top: 0, zIndex: 100,
  },
  logo: { fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 10 },
  topLabel: { fontSize: 11, color: '#888', fontWeight: 400, letterSpacing: 0 },
  logoutBtn: {
    background: 'none', border: '0.5px solid #444', color: '#888',
    padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  },

  main: { maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1a1a', margin: '4px 0 10px' },
  intro: { fontSize: 14, color: '#555', lineHeight: 1.55, marginBottom: 18 },

  cardContract: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '18px 18px 22px', marginBottom: 18,
  },
  contractLine: { fontSize: 13, color: '#1a1a1a', margin: 0, lineHeight: 1.6 },
  contractHeader: { fontSize: 14, color: '#1a1a1a', margin: '14px 0 6px', fontWeight: 600 },

  cardForm: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: 18, marginBottom: 14,
  },
  h3: { fontSize: 15, fontWeight: 500, color: '#1a1a1a', margin: '0 0 6px' },
  formHint: { fontSize: 12, color: '#888', margin: '0 0 14px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  input: (locked) => ({
    width: '100%', padding: '9px 12px',
    border: '0.5px solid #ccc', borderRadius: 8,
    fontSize: 14, fontFamily: 'inherit',
    background: locked ? '#f5f5f3' : '#fff',
    color: locked ? '#888' : '#1a1a1a',
    outline: 'none',
    boxSizing: 'border-box',
  }),
  warn: { fontSize: 11, color: '#A32D2D', marginTop: 4 },

  cardAck: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: 18, marginBottom: 18,
  },
  ackRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 0', cursor: 'pointer', fontSize: 13, color: '#1a1a1a', lineHeight: 1.5,
  },
  checkbox: { marginTop: 3, accentColor: '#F5C842', width: 16, height: 16, flexShrink: 0 },

  btnAccept: {
    width: '100%', background: '#F5C842', color: '#1a1a1a',
    border: 'none', borderRadius: 10, padding: '14px 18px',
    fontSize: 15, fontWeight: 600, transition: 'opacity .15s',
  },
  footnote: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 12, lineHeight: 1.5 },

  errorBlock: {
    background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #F09595',
    borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
  },
}
