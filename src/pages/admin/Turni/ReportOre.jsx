import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  MESI, GIORNI_LUNGHI, oggiStr, primoDelMese, ultimoDelMese, fmtMeseAnno,
  giorniTra, durataMinuti, fmtOreMinuti, fmtRangeOrario, nomeDipendente,
} from '../../../lib/turni'

function fmtDataIT(ds) {
  const [y, m, d] = ds.split('-')
  return `${d}/${m}/${y}`
}
function giornoSettimana(ds) {
  const d = new Date(ds + 'T00:00:00')
  return GIORNI_LUNGHI[(d.getDay() + 6) % 7]
}

export default function ReportOre() {
  const [mode, setMode] = useState('mese')               // 'mese' | 'range'
  const [mese, setMese] = useState(() => primoDelMese(oggiStr()))
  const [rangeStart, setRangeStart] = useState(() => primoDelMese(oggiStr()))
  const [rangeEnd, setRangeEnd] = useState(() => ultimoDelMese(oggiStr()))
  const [dipFiltro, setDipFiltro] = useState('all')
  const [includeDetailPdf, setIncludeDetailPdf] = useState(false)

  const [dipendenti, setDipendenti] = useState([])
  const [shifts, setShifts] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)

  // periodo effettivo
  const periodStart = mode === 'mese' ? primoDelMese(mese) : rangeStart
  const periodEnd = mode === 'mese' ? ultimoDelMese(mese) : rangeEnd
  const periodoLabel = mode === 'mese'
    ? fmtMeseAnno(mese)
    : `${fmtDataIT(periodStart)} – ${fmtDataIT(periodEnd)}`

  useEffect(() => { fetchData() }, [periodStart, periodEnd, dipFiltro])

  async function fetchData() {
    if (periodEnd < periodStart) { setShifts([]); setLeaves([]); setLoading(false); return }
    setLoading(true)
    let shiftQ = supabase.from('shifts').select('*')
      .gte('data', periodStart).lte('data', periodEnd).order('data').order('start_time')
    let leaveQ = supabase.from('leave_requests').select('dipendente_id,type,start_date,end_date')
      .eq('stato', 'approved').lte('start_date', periodEnd).gte('end_date', periodStart)
    if (dipFiltro !== 'all') {
      shiftQ = shiftQ.eq('dipendente_id', dipFiltro)
      leaveQ = leaveQ.eq('dipendente_id', dipFiltro)
    }
    const [dipRes, shiftRes, leaveRes] = await Promise.all([
      supabase.from('dipendenti').select('*').order('ordine', { nullsFirst: false }).order('cognome').order('nome'),
      shiftQ, leaveQ,
    ])
    if (shiftRes.error) showToast('Errore turni: ' + shiftRes.error.message, 'error')
    if (leaveRes.error) showToast('Errore assenze: ' + leaveRes.error.message, 'error')
    setDipendenti(dipRes.data || [])
    setShifts(shiftRes.data || [])
    setLeaves(leaveRes.data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // --- calcolo per dipendente ---
  const rows = useMemo(() => {
    const shiftsByDip = {}
    for (const s of shifts) (shiftsByDip[s.dipendente_id] ||= []).push(s)
    const leavesByDip = {}
    for (const l of leaves) (leavesByDip[l.dipendente_id] ||= []).push(l)

    const elenco = dipFiltro === 'all' ? dipendenti : dipendenti.filter(d => d.id === dipFiltro)

    return elenco.map(dip => {
      const ferieDates = new Set()
      const malattiaDates = new Set()
      for (const l of (leavesByDip[dip.id] || [])) {
        const a = l.start_date > periodStart ? l.start_date : periodStart
        const b = l.end_date < periodEnd ? l.end_date : periodEnd
        for (const g of giorniTra(a, b)) {
          if (l.type === 'malattia') malattiaDates.add(g)
          else ferieDates.add(g)
        }
      }
      const excluded = new Set([...ferieDates, ...malattiaDates])

      const dipShifts = (shiftsByDip[dip.id] || [])
      let oreMin = 0
      const workedDates = new Set()
      for (const s of dipShifts) {
        if (excluded.has(s.data)) continue
        oreMin += durataMinuti(s.start_time, s.end_time)
        workedDates.add(s.data)
      }

      return {
        dip,
        oreMin,
        giorniLavorati: workedDates.size,
        giorniFerie: ferieDates.size,
        giorniMalattia: malattiaDates.size,
        shifts: dipShifts,
        ferieDates, malattiaDates, excluded,
      }
    })
  }, [dipendenti, shifts, leaves, dipFiltro, periodStart, periodEnd])

  // in "Tutti" nascondo i dipendenti senza attività e non attivi
  const visibleRows = useMemo(() => {
    if (dipFiltro !== 'all') return rows
    return rows.filter(r => r.dip.attivo || r.oreMin > 0 || r.giorniFerie > 0 || r.giorniMalattia > 0)
  }, [rows, dipFiltro])

  const totali = useMemo(() => {
    return visibleRows.reduce((acc, r) => ({
      oreMin: acc.oreMin + r.oreMin,
      giorniLavorati: acc.giorniLavorati + r.giorniLavorati,
      giorniFerie: acc.giorniFerie + r.giorniFerie,
      giorniMalattia: acc.giorniMalattia + r.giorniMalattia,
    }), { oreMin: 0, giorniLavorati: 0, giorniFerie: 0, giorniMalattia: 0 })
  }, [visibleRows])

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // dettaglio cronologico di una riga (turni + giorni di assenza)
  function buildDetail(r) {
    const date = new Set([...r.shifts.map(s => s.data), ...r.ferieDates, ...r.malattiaDates])
    return [...date].sort().map(d => ({
      data: d,
      shifts: r.shifts.filter(s => s.data === d),
      excluded: r.excluded.has(d),
      ferie: r.ferieDates.has(d),
      malattia: r.malattiaDates.has(d),
    }))
  }

  // --- export PDF ---
  async function esportaPDF() {
    setExporting(true)
    try {
      const { jsPDF } = await import('https://esm.sh/jspdf@2.5.1')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const now = new Date().toLocaleString('it-IT')
      let y = 15

      doc.setFontSize(15); doc.setFont('helvetica', 'bold')
      doc.text('ASC Hotel · Arezzo Sport College', 15, y); y += 6
      doc.setFontSize(13)
      doc.text('Report ore', 15, y); y += 6
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
      doc.text(`Periodo: ${periodoLabel}   ·   Generato il ${now}`, 15, y); doc.setTextColor(0); y += 9

      // intestazioni colonna
      const COL = { ore: 120, gg: 145, fer: 168, mal: 190 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text('Dipendente', 15, y)
      doc.text('Ore', COL.ore, y, { align: 'right' })
      doc.text('GG', COL.gg, y, { align: 'right' })
      doc.text('Ferie', COL.fer, y, { align: 'right' })
      doc.text('Mal.', COL.mal, y, { align: 'right' })
      y += 2; doc.setDrawColor(200); doc.line(15, y, 195, y); y += 4

      doc.setFont('helvetica', 'normal')
      for (const r of visibleRows) {
        if (y > 275) { doc.addPage(); y = 15 }
        doc.text(nomeDipendente(r.dip).slice(0, 48), 15, y)
        doc.text(fmtOreMinuti(r.oreMin), COL.ore, y, { align: 'right' })
        doc.text(String(r.giorniLavorati), COL.gg, y, { align: 'right' })
        doc.text(String(r.giorniFerie), COL.fer, y, { align: 'right' })
        doc.text(String(r.giorniMalattia), COL.mal, y, { align: 'right' })
        y += 6
      }
      // totale
      if (dipFiltro === 'all') {
        doc.setDrawColor(200); doc.line(15, y - 2, 195, y - 2)
        doc.setFont('helvetica', 'bold')
        doc.text('Totale', 15, y)
        doc.text(fmtOreMinuti(totali.oreMin), COL.ore, y, { align: 'right' })
        doc.text(String(totali.giorniLavorati), COL.gg, y, { align: 'right' })
        doc.text(String(totali.giorniFerie), COL.fer, y, { align: 'right' })
        doc.text(String(totali.giorniMalattia), COL.mal, y, { align: 'right' })
        y += 8
      }

      // dettaglio opzionale
      if (includeDetailPdf) {
        for (const r of visibleRows) {
          const det = buildDetail(r)
          if (det.length === 0) continue
          if (y > 265) { doc.addPage(); y = 15 }
          y += 2
          doc.setFontSize(11); doc.setFont('helvetica', 'bold')
          doc.text(nomeDipendente(r.dip), 15, y); y += 5
          doc.setFontSize(9); doc.setFont('helvetica', 'normal')
          for (const g of det) {
            if (y > 282) { doc.addPage(); y = 15 }
            const gg = `${giornoSettimana(g.data).slice(0, 3)} ${fmtDataIT(g.data)}`
            if (g.shifts.length === 0 && (g.ferie || g.malattia)) {
              doc.setTextColor(150)
              doc.text(`${gg}  —  ${g.malattia ? 'malattia' : 'ferie'}`, 18, y); doc.setTextColor(0); y += 5
            } else {
              for (const s of g.shifts) {
                const ore = fmtOreMinuti(durataMinuti(s.start_time, s.end_time))
                const tag = g.excluded ? `  (non conteggiato · ${g.malattia ? 'malattia' : 'ferie'})` : ''
                if (g.excluded) doc.setTextColor(150)
                doc.text(`${gg}  ${fmtRangeOrario(s.start_time, s.end_time)}  ${ore}${tag}`, 18, y)
                doc.setTextColor(0); y += 5
                if (y > 282) { doc.addPage(); y = 15 }
              }
            }
          }
          y += 3
        }
      }

      const fname = mode === 'mese'
        ? `report-ore-${mese.slice(0, 7)}.pdf`
        : `report-ore-${periodStart}_${periodEnd}.pdf`
      doc.save(fname)
    } catch (e) {
      showToast('Errore PDF: ' + (e?.message || e), 'error')
    } finally {
      setExporting(false)
    }
  }

  // opzioni anno per la modalità mese
  const annoCorr = Number(oggiStr().slice(0, 4))
  const anni = [annoCorr - 2, annoCorr - 1, annoCorr, annoCorr + 1]
  const meseSel = Number(mese.slice(5, 7)) - 1
  const annoSel = Number(mese.slice(0, 4))
  function setMeseAnno(m, a) {
    setMese(`${a}-${String(m + 1).padStart(2, '0')}-01`)
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link to="/admin/turni" style={{ color: '#888', textDecoration: 'none' }}>← Torna ai turni</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Report ore</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDetailPdf} onChange={e => setIncludeDetailPdf(e.target.checked)} />
            Includi dettaglio nel PDF
          </label>
          <button className="btn-primary" onClick={esportaPDF} disabled={exporting || loading}>
            {exporting ? 'Esporto...' : 'Esporta PDF'}
          </button>
        </div>
      </div>

      {/* FILTRI */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Periodo</div>
            <div style={{ display: 'inline-flex', border: '0.5px solid #ddd', borderRadius: 8, overflow: 'hidden', marginRight: 8 }}>
              {[['mese', 'Mese'], ['range', 'Range date']].map(([k, label]) => (
                <button key={k} onClick={() => setMode(k)} style={{
                  border: 'none', padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  background: mode === k ? '#F5C842' : '#fff', color: mode === k ? '#1a1a1a' : '#888',
                  fontWeight: mode === k ? 500 : 400,
                }}>{label}</button>
              ))}
            </div>
          </div>

          {mode === 'mese' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={meseSel} onChange={e => setMeseAnno(Number(e.target.value), annoSel)} style={selStyle}>
                {MESI.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
              </select>
              <select value={annoSel} onChange={e => setMeseAnno(meseSel, Number(e.target.value))} style={selStyle}>
                {anni.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={selStyle} />
              <span style={{ color: '#aaa' }}>→</span>
              <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={selStyle} />
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Dipendente</div>
            <select value={dipFiltro} onChange={e => setDipFiltro(e.target.value)} style={selStyle}>
              <option value="all">Tutti</option>
              {dipendenti.map(d => <option key={d.id} value={d.id}>{nomeDipendente(d)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 12, textTransform: 'capitalize' }}>
          Periodo selezionato: <strong>{periodoLabel}</strong>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: '#888' }}>Caricamento...</div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 620, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th style={{ textAlign: 'left' }}>Dipendente</th>
                <th style={{ textAlign: 'right' }}>Ore totali</th>
                <th style={{ textAlign: 'right' }}>Giorni lavorati</th>
                <th style={{ textAlign: 'right' }}>Giorni ferie</th>
                <th style={{ textAlign: 'right' }}>Giorni malattia</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => {
                const isOpen = expanded.has(r.dip.id)
                return (
                  <FragmentRow key={r.dip.id}>
                    <tr onClick={() => toggleExpand(r.dip.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center', color: '#aaa' }}>{isOpen ? '▾' : '▸'}</td>
                      <td style={{ fontWeight: 500 }}>{nomeDipendente(r.dip)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtOreMinuti(r.oreMin)}</td>
                      <td style={{ textAlign: 'right' }}>{r.giorniLavorati}</td>
                      <td style={{ textAlign: 'right' }}>{r.giorniFerie || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{r.giorniMalattia || '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ background: '#faf9f6', padding: '8px 14px' }}>
                          <DettaglioRiga giorni={buildDetail(r)} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={6} style={{ color: '#888', textAlign: 'center', padding: 24 }}>Nessun dato nel periodo selezionato.</td></tr>
              )}
              {dipFiltro === 'all' && visibleRows.length > 0 && (
                <tr style={{ borderTop: '1.5px solid #ddd', fontWeight: 600 }}>
                  <td></td>
                  <td>Totale</td>
                  <td style={{ textAlign: 'right' }}>{fmtOreMinuti(totali.oreMin)}</td>
                  <td style={{ textAlign: 'right' }}>{totali.giorniLavorati}</td>
                  <td style={{ textAlign: 'right' }}>{totali.giorniFerie}</td>
                  <td style={{ textAlign: 'right' }}>{totali.giorniMalattia}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// wrapper per usare una key su una coppia di <tr> senza div intermedi
function FragmentRow({ children }) {
  return <>{children}</>
}

function DettaglioRiga({ giorni }) {
  if (giorni.length === 0) return <div style={{ fontSize: 12, color: '#888' }}>Nessun turno nel periodo.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {giorni.map(g => (
        <div key={g.data} style={{ fontSize: 12 }}>
          {g.shifts.length === 0 ? (
            <span style={{ color: '#888' }}>
              {giornoSettimana(g.data)} {fmtDataIT(g.data)} — {' '}
              <span className={`pill ${g.malattia ? 'pill-alert' : 'pill-info'}`}>{g.malattia ? 'malattia' : 'ferie'}</span>
            </span>
          ) : (
            g.shifts.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: g.excluded ? '#aaa' : '#444', padding: '1px 0' }}>
                <span style={{ minWidth: 150 }}>{giornoSettimana(g.data)} {fmtDataIT(g.data)}</span>
                <span style={{ minWidth: 110 }}>{fmtRangeOrario(s.start_time, s.end_time)}</span>
                <span style={{ minWidth: 56, fontWeight: 500 }}>{fmtOreMinuti(durataMinuti(s.start_time, s.end_time))}</span>
                {g.excluded && (
                  <span className={`pill ${g.malattia ? 'pill-alert' : 'pill-info'}`}>
                    non conteggiato · {g.malattia ? 'malattia' : 'ferie'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

const selStyle = {
  padding: '8px 10px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, background: '#fff',
}
