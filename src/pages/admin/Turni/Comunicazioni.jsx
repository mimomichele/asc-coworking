import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fmtRigaDate, scaricaXml } from '../../../lib/intermittenti'
import RiepilogoComunicazioni from './RiepilogoComunicazioni'

// /admin/turni/comunicazioni — lavoratori intermittenti: cosa c'e' da
// inviare al Ministero e il registro di tutto cio' che e' stato inviato.
export default function Comunicazioni() {
  const [invii, setInvii] = useState([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)

  useEffect(() => { fetchRegistro() }, [])

  async function fetchRegistro() {
    const { data, error } = await supabase.from('intermittenti_invii')
      .select('*').order('created_at', { ascending: false }).limit(200)
    if (error) setErrore(error.message)
    setInvii(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#6B6B6B', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Comunicazioni intermittenti</h2>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>
          Lavoratori con contratto a chiamata: ogni giornata va comunicata al Ministero prima dell'inizio del turno (modello ML-15-01).
        </div>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '18px 0 10px' }}>Da inviare</h3>
      <RiepilogoComunicazioni onChange={fetchRegistro} />

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 10px' }}>Registro invii</h3>
      {errore && <div className="pill pill-alert" style={{ marginBottom: 10 }}>Errore: {errore}</div>}
      {loading ? (
        <div style={{ padding: 16, color: '#6B6B6B' }}>Caricamento...</div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Data e ora</th>
                <th>Tipo</th>
                <th>Righe inviate</th>
                <th>Admin</th>
                <th>Esito</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invii.map(inv => (
                <tr key={inv.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDataOra(inv.created_at)}</td>
                  <td>
                    <span className={`pill ${inv.tipo === 'annullamento' ? 'pill-alert' : 'pill-info'}`}>
                      {inv.tipo === 'annullamento' ? 'Annullamento' : 'Comunicazione'}
                    </span>
                    {inv.prova && <span className="pill pill-warn" style={{ marginLeft: 4 }}>prova</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {(inv.righe || []).map((r, i) => (
                      <div key={i}>{r.nome} · {fmtRigaDate(r)}</div>
                    ))}
                  </td>
                  <td style={{ fontSize: 12, color: '#6B6B6B' }}>{inv.admin_email || '—'}</td>
                  <td>
                    {inv.esito === 'inviato'
                      ? <span className="pill pill-ok">Inviato</span>
                      : <span className="pill pill-alert" title={inv.errore || ''}>Errore</span>}
                    {inv.esito !== 'inviato' && inv.errore && (
                      <div style={{ fontSize: 11, color: '#C5221F', marginTop: 4, maxWidth: 260 }}>{inv.errore}</div>
                    )}
                    {inv.destinatario && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{inv.destinatario}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => scaricaXml(inv.xml, `moduloIntermittenti-${inv.created_at.slice(0, 10)}.xml`)}>XML</button>
                  </td>
                </tr>
              ))}
              {invii.length === 0 && (
                <tr><td colSpan={6} style={{ color: '#6B6B6B', textAlign: 'center', padding: 24 }}>Nessun invio ancora registrato.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function fmtDataOra(iso) {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}
