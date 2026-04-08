import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Ospiti() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('surname') // surname | rem_asc | rem_desc

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select(`
        id, name, surname, phone, type,
        members (
          id, name, surname,
          subscriptions ( entries_used, entries_total, paid_amount, active )
        )
      `)
    setAccounts(data || [])
    setLoading(false)
  }

  // calcola ingressi rimasti totali per account (somma di tutti i membri attivi)
  function totalRem(account) {
    return (account.members || []).reduce((s, m) => {
      const sub = (m.subscriptions || []).find(x => x.active)
      return s + (sub ? sub.entries_total - sub.entries_used : 0)
    }, 0)
  }

  // cerca sia nel titolare che nei familiari
  const filtered = accounts.filter(a => {
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
    return 0
  })

  // totale membri (inclusi familiari)
  const totalMembri = accounts.reduce((s, a) => s + (a.members || []).length, 0)

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Ospiti ({accounts.length} account)</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{totalMembri} membri totali inclusi i familiari</div>
        </div>
        <button className="btn-primary" onClick={() => navigate('/admin/nuovo-ospite')}>+ Nuovo ospite</button>
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
        </select>
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

              return (
                <tr key={account.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar">{account.name?.[0]}{account.surname?.[0]}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{account.name} {account.surname}</div>
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
    </div>
  )
}
