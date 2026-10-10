import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fmtIntervallo } from '../../../lib/intermittenti'

// Registro degli invii al Ministero per i lavoratori a chiamata.
export default function Comunicazioni() {
  const [invii, setInvii] = useState([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)

  useEffect(() => {
    supabase.from('intermittenti_invii').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (error) setErrore(error.message)
        setInvii(data || [])
        setLoading(false)
      })
  }, [])

  function scaricaXml(inv) {
    const url = URL.createObjectURL(new Blob([inv.xml], { type: 'text/xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `UNI_Intermittenti_${inv.created_at.slice(0, 10)}_${inv.id.slice(0, 8)}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: 40, color: '#6B6B6B' }}>Caricamento...</div>

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#6B6B6B', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700 }}>Comunicazioni intermittenti</h2>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2, marginBottom: 16 }}>
        Registro degli invii al Ministero del Lavoro per i lavoratori a chiamata
      </div>
      {errore && <div className="card" style={{ color: '#C5221F', marginBottom: 12 }}>Errore: {errore}</div>}

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Data e ora</th>
              <th>Tipo</th>
              <th>Righe inviate</th>
              <th>Confermato da</th>
              <th>Esito</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invii.map(inv => (
              <tr key={inv.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {new Date(inv.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td>
                  <span className="pill" style={inv.tipo === 'annullamento'
                    ? { background: '#FCEBEB', color: '#C5221F' } : { background: '#F1EFE8', color: '#111111' }}>
                    {inv.tipo === 'annullamento' ? 'Annullamento' : 'Comunicazione'}
                  </span>
                  {inv.prova && <span className="pill" style={{ marginLeft: 6, background: '#E6F1FB', color: '#185FA5' }}>Prova</span>}
                </td>
                <td style={{ fontSize: 12 }}>
                  {(inv.righe || []).map((r, i) => (
                    <div key={i}><strong>{r.nome}</strong> · {fmtIntervallo(r)}</div>
                  ))}
                </td>
                <td style={{ fontSize: 12, color: '#6B6B6B' }}>{inv.admin_email || '—'}</td>
                <td>
                  <span className={`pill ${inv.esito === 'ok' ? 'pill-ok' : ''}`}
                    style={inv.esito === 'ok' ? undefined : { background: '#FCEBEB', color: '#C5221F' }}
                    title={inv.errore || ''}>
                    {inv.esito === 'ok' ? 'Inviata' : 'Errore'}
                  </span>
                  {inv.errore && <div style={{ fontSize: 11, color: '#C5221F', marginTop: 2 }}>{inv.errore}</div>}
                </td>
                <td><button className="btn-ghost" onClick={() => scaricaXml(inv)}>XML</button></td>
              </tr>
            ))}
            {invii.length === 0 && (
              <tr><td colSpan={6} style={{ color: '#6B6B6B', textAlign: 'center', padding: 24 }}>Nessun invio registrato.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
