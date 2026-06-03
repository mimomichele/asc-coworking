import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtRangeOrario, MESI } from '../../lib/turni'

function statoPill(stato) {
  if (stato === 'approved') return <span className="pill pill-ok">Approvata</span>
  if (stato === 'rejected') return <span className="pill pill-alert">Rifiutata</span>
  return <span className="pill pill-warn">In attesa</span>
}

// 'YYYY-MM-DD' -> '8 giu'
function fmtBreve(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`
}

export default function MieRichieste({ dipendente }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [scr, leave] = await Promise.all([
      supabase.from('shift_change_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
    ])
    const a = (scr.data || []).map(r => ({
      key: 'scr-' + r.id,
      kind: 'Modifica orario',
      detail: `${fmtBreve(r.requested_data)} → ${fmtRangeOrario(r.requested_start, r.requested_end)}`,
      motivo: r.motivo,
      stato: r.stato,
      created_at: r.created_at,
    }))
    const b = (leave.data || []).map(r => ({
      key: 'leave-' + r.id,
      kind: r.type === 'malattia' ? 'Malattia' : 'Ferie',
      detail: `${fmtBreve(r.start_date)} – ${fmtBreve(r.end_date)}`,
      motivo: r.note,
      stato: r.stato,
      created_at: r.created_at,
    }))
    const merged = [...a, ...b].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''))
    setItems(merged)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Caricamento...</div>

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Le mie richieste</h2>

      {items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#888' }}>
          Nessuna richiesta inviata.
        </div>
      )}

      {items.map(it => (
        <div key={it.key} className="card" style={{ marginBottom: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.kind}</div>
              <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{it.detail}</div>
              {it.motivo && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{it.motivo}</div>}
            </div>
            {statoPill(it.stato)}
          </div>
        </div>
      ))}
    </div>
  )
}
