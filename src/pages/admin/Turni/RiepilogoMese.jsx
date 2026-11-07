// Pagina "Riepilogo mese" — stessa tabella che l'endpoint /api/presenze
// consegna al consulente del lavoro. Serve alla reception per controllare
// a vista che i numeri corrispondano a quanto verrà spedito a Elledue.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  calcolaRiepilogo, estremiMese, meseLabel, mesePrecedenteRoma, MESI_IT,
} from '../../../lib/riepilogoPresenze'

export default function RiepilogoMese() {
  const [mese, setMese] = useState(() => mesePrecedenteRoma())
  const [dipendenti, setDipendenti] = useState([])
  const [shifts, setShifts] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const { primo, ultimo } = useMemo(() => estremiMese(mese), [mese])

  useEffect(() => { fetchAll() }, [mese])

  async function fetchAll() {
    setLoading(true)
    const [dipRes, shiftRes, leaveRes] = await Promise.all([
      supabase.from('dipendenti').select('id,nome,cognome,ordine,a_chiamata,attivo'),
      supabase.from('shifts').select('dipendente_id,data,start_time,end_time')
        .gte('data', primo).lte('data', ultimo),
      supabase.from('leave_requests').select('dipendente_id,type,start_date,end_date')
        .eq('stato', 'approved').lte('start_date', ultimo).gte('end_date', primo),
    ])
    if (dipRes.error)   showToast('Errore dipendenti: ' + dipRes.error.message, 'error')
    if (shiftRes.error) showToast('Errore turni: '      + shiftRes.error.message, 'error')
    if (leaveRes.error) showToast('Errore assenze: '    + leaveRes.error.message, 'error')
    setDipendenti(dipRes.data || [])
    setShifts(shiftRes.data || [])
    setLeaves(leaveRes.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const righe = useMemo(() => {
    if (loading) return []
    return calcolaRiepilogo({ mese, dipendenti, shifts, leaves })
  }, [mese, dipendenti, shifts, leaves, loading])

  const totali = useMemo(() => righe.reduce((acc, r) => ({
    giorni_lavorati: acc.giorni_lavorati + r.giorni_lavorati,
    ore_lavorate:    Math.round((acc.ore_lavorate + r.ore_lavorate) * 100) / 100,
    ferie:           acc.ferie + r.ferie,
    malattia:        acc.malattia + r.malattia,
  }), { giorni_lavorati: 0, ore_lavorate: 0, ferie: 0, malattia: 0 }), [righe])

  // selezione mese/anno coerente col resto del modulo turni
  const annoCorr = Number(mesePrecedenteRoma().slice(0, 4))
  const anni = [annoCorr - 1, annoCorr, annoCorr + 1]
  const [annoSel, meseSel] = mese.split('-').map(Number)
  function setMeseAnno(m, a) { setMese(`${a}-${String(m).padStart(2, '0')}`) }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#6B6B6B', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Riepilogo mese</h2>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>
          Stessi dati inviati al consulente del lavoro (Elledue) a inizio mese.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field">
            <label>Mese</label>
            <select value={meseSel} onChange={e => setMeseAnno(Number(e.target.value), annoSel)}>
              {MESI_IT.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Anno</label>
            <select value={annoSel} onChange={e => setMeseAnno(meseSel, Number(e.target.value))}>
              {anni.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginLeft: 'auto' }}>
            {meseLabel(mese)}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: '#6B6B6B' }}>Caricamento...</div>
      ) : righe.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#6B6B6B' }}>
          Nessun turno né assenza registrati per {meseLabel(mese)}.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Lavoratore</th>
                <th style={{ textAlign: 'left', width: 140 }}>Contratto</th>
                <th style={{ textAlign: 'right', width: 110 }}>Giorni</th>
                <th style={{ textAlign: 'right', width: 110 }}>Ore</th>
                <th style={{ textAlign: 'right', width: 90 }}>Ferie</th>
                <th style={{ textAlign: 'right', width: 110 }}>Malattia</th>
                <th style={{ textAlign: 'right', width: 110 }}>Permessi</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={r.nome + i}>
                  <td style={{ fontWeight: 500 }}>{r.nome}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: r.contratto === 'intermittente' ? '#FAEEDA' : '#EEF2F7',
                        color:      r.contratto === 'intermittente' ? '#854F0B' : '#185FA5',
                      }}
                    >
                      {r.contratto}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.giorni_lavorati}</td>
                  <td style={{ textAlign: 'right' }}>{fmtOre(r.ore_lavorate)}</td>
                  <td style={{ textAlign: 'right' }}>{r.ferie || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.malattia || '—'}</td>
                  <td style={{ textAlign: 'right', color: '#aaa' }}>{r.permessi}</td>
                </tr>
              ))}
              <tr style={{ background: '#faf9f6', fontWeight: 500 }}>
                <td>Totale</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{totali.giorni_lavorati}</td>
                <td style={{ textAlign: 'right' }}>{fmtOre(totali.ore_lavorate)}</td>
                <td style={{ textAlign: 'right' }}>{totali.ferie || '—'}</td>
                <td style={{ textAlign: 'right' }}>{totali.malattia || '—'}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 16, lineHeight: 1.5 }}>
        I permessi non sono gestiti nell'app e restano a 0 nel riepilogo.
        Un giorno con ferie o malattia non conteggia le ore, anche se c'è un turno
        registrato.
      </div>
    </div>
  )
}

// 124.5 -> "124:30", 22 -> "22:00". Formato coerente col Report ore.
function fmtOre(ore) {
  const totMin = Math.round(ore * 60)
  const h = Math.floor(totMin / 60)
  const m = totMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
