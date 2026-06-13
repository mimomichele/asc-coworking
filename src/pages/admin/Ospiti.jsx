import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import WalkinModal from '../../components/WalkinModal.jsx'

export default function Ospiti() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('surname') // surname | rem_asc | rem_desc
  const [showDisattivati, setShowDisattivati] = useState(false)
  const [showOnlyToSign, setShowOnlyToSign] = useState(false)
  // Set degli auth user_id che hanno almeno una firma in contract_signatures.
  // Caricato in parallelo agli accounts. RLS sig_admin_read consente all'admin
  // di leggere tutte le righe.
  const [signedUserIds, setSignedUserIds] = useState(() => new Set())
  // Modal "+ Aggiungi ingresso" (walk-in admin) e toast di feedback.
  const [walkinOpen, setWalkinOpen] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchAccounts() }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function fetchAccounts() {
    // accounts + signatures in parallelo (no dipendenza tra le due).
    const [
      { data: accs, error: accsErr },
      { data: sigs, error: sigsErr },
    ] = await Promise.all([
      supabase
        .from('accounts')
        .select(`
          id, name, surname, phone, type, attivo, owner_id,
          members (
            id, name, surname,
            subscriptions ( id, created_at, entries_used, entries_total, paid_amount, active )
          )
        `),
      // user_id duplicati possibili in futuro (re-firma): il Set deduplica.
      supabase.from('contract_signatures').select('user_id'),
    ])
    if (accsErr) console.error('[Ospiti.fetchAccounts accounts]', accsErr)
    if (sigsErr) console.error('[Ospiti.fetchAccounts signatures]', sigsErr)
    setAccounts(accs || [])
    setSignedUserIds(new Set((sigs || []).map(s => s.user_id)))
    setLoading(false)
  }

  // calcola ingressi rimasti totali per account (somma di tutti i membri attivi)
  function totalRem(account) {
    return (account.members || []).reduce((s, m) => {
      const sub = (m.subscriptions || []).find(x => x.active)
      return s + (sub ? sub.entries_total - sub.entries_used : 0)
    }, 0)
  }

  // Data di creazione dell'abbonamento piu' recente del nucleo (qualsiasi
  // stato, anche scaduti/disattivati — chi ha rinnovato di recente sta in
  // cima). Ritorna null per account senza abbonamenti → ordinati in fondo.
  function lastSubDate(account) {
    const dates = (account.members || [])
      .flatMap(m => m.subscriptions || [])
      .map(s => s.created_at)
      .filter(Boolean)
    if (dates.length === 0) return null
    return dates.reduce((max, d) => d > max ? d : max)
  }

  // cerca sia nel titolare che nei familiari, nasconde i disattivati
  // di default e (opzionalmente) restringe ai soli "da firmare".
  // Tutti e tre i filtri compongono in AND.
  const filtered = accounts.filter(a => {
    if (!showDisattivati && a.attivo === false) return false
    if (showOnlyToSign && signedUserIds.has(a.owner_id)) return false
    const q = search.toLowerCase()
    if (!q) return true
    const titolare = `${a.name} ${a.surname}`.toLowerCase()
    if (titolare.includes(q)) return true
    if (a.phone?.includes(q)) return true
    // cerca nei membri familiari
    return (a.members || []).some(m =>
      `${m.name} ${m.surname}`.toLowerCase().includes(q)
    )
  })

  // ordinamento
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'surname') return a.surname.localeCompare(b.surname)
    if (sortBy === 'rem_asc') return totalRem(a) - totalRem(b)
    if (sortBy === 'rem_desc') return totalRem(b) - totalRem(a)
    if (sortBy === 'sub_recent') {
      const da = lastSubDate(a)
      const db = lastSubDate(b)
      if (da === null && db === null) return 0
      if (da === null) return 1   // a (senza sub) in fondo
      if (db === null) return -1  // b (senza sub) in fondo
      return db.localeCompare(da) // ISO desc = piu' recente in cima
    }
    return 0
  })

  // totale membri (inclusi familiari)
  const totalMembri = accounts.reduce((s, a) => s + (a.members || []).length, 0)
  // contatori attivi/disattivati
  const numAttivi = accounts.filter(a => a.attivo !== false).length
  const numDisattivi = accounts.length - numAttivi
  // ospiti senza firma sul contratto (qualsiasi stato attivo/disattivato).
  const numToSign = accounts.filter(a => !signedUserIds.has(a.owner_id)).length

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Ospiti ({accounts.length} account)</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {numAttivi} attiv{numAttivi === 1 ? 'o' : 'i'}
            {numDisattivi > 0 && <> · {numDisattivi} disattivat{numDisattivi === 1 ? 'o' : 'i'}</>}
            {' · '}{totalMembri} membri totali inclusi i familiari
            {numToSign > 0 && (
              <> · <span style={{ color: '#854F0B', fontWeight: 500 }}>{numToSign} da firmare</span></>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setWalkinOpen(true)}>+ Aggiungi ingresso</button>
          <button className="btn-primary" onClick={() => navigate('/admin/nuovo-ospite')}>+ Nuovo ospite</button>
        </div>
      </div>

      {/* barra cerca + ordina */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input
          placeholder="Cerca per nome (anche familiari) o telefono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '9px 12px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff' }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ padding: '9px 12px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff', color: '#1a1a1a' }}
        >
          <option value="surname">Ordina: Cognome A→Z</option>
          <option value="rem_asc">Ordina: Ingressi rimasti ↑</option>
          <option value="rem_desc">Ordina: Ingressi rimasti ↓</option>
          <option value="sub_recent">Ordina: Abbonamento più recente</option>
        </select>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 12px', border: '0.5px solid #ccc', borderRadius: 8,
          background: '#fff', fontSize: 13, color: '#888',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <input
            type="checkbox"
            checked={showDisattivati}
            onChange={e => setShowDisattivati(e.target.checked)}
            style={{ accentColor: '#F5C842' }}
          />
          Mostra disattivati
        </label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 12px', border: '0.5px solid #ccc', borderRadius: 8,
          background: '#fff', fontSize: 13, color: '#888',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <input
            type="checkbox"
            checked={showOnlyToSign}
            onChange={e => setShowOnlyToSign(e.target.checked)}
            style={{ accentColor: '#BA7517' }}
          />
          Solo da firmare
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Nominativo</th>
              <th style={{ width: '12%' }}>Tipo</th>
              <th style={{ width: '30%' }}>Ingressi rimasti</th>
              <th style={{ width: '14%' }}>Pagato totale</th>
              <th style={{ width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(account => {
              const members = account.members || []
              const totalPaid = members.reduce((s, m) =>
                s + (m.subscriptions || []).reduce((ss, sub) => ss + (sub.paid_amount || 0), 0), 0)

              const disattivato = account.attivo === false
              const firmato = signedUserIds.has(account.owner_id)
              return (
                <tr key={account.id} style={{ opacity: disattivato ? 0.55 : 1 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar">{account.name?.[0]}{account.surname?.[0]}</div>
                      <div>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{account.name} {account.surname}</span>
                          {disattivato && <span className="pill pill-alert" style={{ fontSize: 10 }}>Disattivato</span>}
                          {firmato
                            ? <span className="pill pill-ok" style={{ fontSize: 10 }}>✓ Firmato</span>
                            : <span className="pill pill-warn" style={{ fontSize: 10 }}>Da firmare</span>
                          }
                        </div>
                        {members.length > 1 && (
                          <div style={{ fontSize: 11, color: '#888' }}>
                            + {members
                              .filter(m => !(m.name === account.name && m.surname === account.surname))
                              .map(m => m.name).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${account.type === 'family' ? 'pill-info' : 'pill-gray'}`}>
                      {account.type === 'family' ? 'Familiare' : 'Singolo'}
                    </span>
                  </td>
                  <td>
                    {members.map(m => {
                      const sub = (m.subscriptions || []).find(s => s.active)
                      if (!sub) return null
                      const rem = sub.entries_total - sub.entries_used
                      const pct = Math.round((sub.entries_used / sub.entries_total) * 100)
                      return (
                        <div key={m.id} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 11, color: '#888' }}>
                            {m.name}:{' '}
                            <span style={{ color: rem <= 3 ? '#E24B4A' : '#1a1a1a', fontWeight: rem <= 3 ? 500 : 400 }}>
                              {rem}/{sub.entries_total}
                            </span>
                          </div>
                          <div className="progress">
                            <div className="progress-fill" style={{ width: `${pct}%`, background: rem <= 3 ? '#E24B4A' : '#F5C842' }} />
                          </div>
                        </div>
                      )
                    })}
                  </td>
                  <td style={{ fontWeight: 500 }}>€ {totalPaid.toLocaleString('it-IT')}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => navigate(`/admin/ospiti/${account.id}`)}>Apri</button>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: 24 }}>Nessun ospite trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {walkinOpen && (
        <WalkinModal
          accounts={accounts}
          onClose={() => setWalkinOpen(false)}
          onSuccess={(msg) => {
            setWalkinOpen(false)
            showToast(msg)
            fetchAccounts()
          }}
        />
      )}
    </div>
  )
}
