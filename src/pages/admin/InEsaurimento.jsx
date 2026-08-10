import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function InEsaurimento() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('subscriptions')
      .select(`
        id, entries_used, entries_total,
        members ( id, name, surname, account_id,
          accounts ( id, name, surname, type )
        ),
        subscription_types ( name )
      `)
      .eq('active', true)

    // Set dei member_id "coperti": hanno almeno 1 sub attivo NON in esaurimento
    // (rimasti > 3). Semantica: quel membro ha effettivamente rinnovato con un
    // pacchetto nuovo → non va sollecitato per gli altri sub esauriti/residui.
    // Granularita' per membro (non per account): in un familiare, se Alice
    // rinnova Marco resta comunque visibile con il suo esaurimento.
    const membriCoperti = new Set()
    for (const s of (data || [])) {
      if ((s.entries_total - s.entries_used) > 3 && s.members?.id) {
        membriCoperti.add(s.members.id)
      }
    }

    const filtered = (data || []).filter(s => {
      const rem = s.entries_total - s.entries_used
      if (rem > 3) return false                        // non in esaurimento
      return !membriCoperti.has(s.members?.id)         // il membro non ha rinnovato
    })
    filtered.sort((a, b) => (a.entries_total - a.entries_used) - (b.entries_total - b.entries_used))
    setItems(filtered)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#6B6B6B' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>In esaurimento</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>Abbonamenti con 3 o meno ingressi rimasti</div>

      {items.length === 0
        ? <div className="card" style={{ color: '#6B6B6B', fontSize: 13 }}>Nessun abbonamento in esaurimento. Ottimo!</div>
        : (
          <>
            <div style={{ background: '#FAEEDA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#854F0B', marginBottom: 16 }}>
              {items.length} abbonament{items.length > 1 ? 'i' : 'o'} con 3 o meno ingressi rimasti
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Membro</th>
                    <th>Account</th>
                    <th>Abbonamento</th>
                    <th>Rimasti</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(s => {
                    const rem = s.entries_total - s.entries_used
                    const pct = Math.round((s.entries_used / s.entries_total) * 100)
                    return (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar">{s.members?.name?.[0]}{s.members?.surname?.[0]}</div>
                            <span>{s.members?.name} {s.members?.surname}</span>
                          </div>
                        </td>
                        <td>
                          <span className="pill pill-info">
                            {s.members?.accounts?.name} {s.members?.accounts?.surname}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{s.subscription_types?.name}</td>
                        <td>
                          <span style={{ fontWeight: 500, color: '#C5221F' }}>
                            {rem} rimast{rem === 1 ? 'o' : 'i'}
                          </span>
                          <div className="progress" style={{ marginTop: 4, width: 80 }}>
                            <div className="progress-fill" style={{ width: `${pct}%`, background: '#C5221F' }} />
                          </div>
                        </td>
                        <td>
                          <button className="btn-ghost" onClick={() => navigate(`/admin/ospiti/${s.members?.account_id}`)}>
                            Scheda
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      }
    </div>
  )
}
