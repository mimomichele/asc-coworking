// ============================================================
// StatisticheCoworking — sezione analytics nella dashboard admin
// coworking. Mostra metriche aggregate (totale ingressi, media/gg,
// abbonamenti venduti) e grafici (giorno settimana, mese) per il
// periodo selezionato dall'utente.
//
// Fase 1 (questa): scaffold, date pickers, 3 box riepilogativi.
// Fase 2: grafici A (bar weekday) + B (line month) — da aggiungere.
//
// Architettura: tutto client-side. 2 fetch in parallelo
// (bookings + subscriptions filtrate per periodo), aggregazioni
// derivate via useMemo. Cap difensivo .limit(50000) su bookings
// per evitare blowup nel caso (improbabile) di volumi enormi.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'

// Helper: 'YYYY-MM-DD' del giorno corrente nel timezone locale.
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Helper: 'YYYY-MM-DD' di N giorni fa.
function daysAgoIso(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function pad2(n) { return String(n).padStart(2, '0') }

// Settimana che inizia da lunedi' (richiesto). JS getDay() ritorna
// 0=domenica..6=sabato → rimappiamo a 0=lunedi..6=domenica.
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MONTH_LABELS_SHORT = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
]

function jsDayToMondayIndex(jsDay) {
  return (jsDay + 6) % 7
}

// 'YYYY-MM' → 'mag 26' (label compatta italiana per asse X line chart).
function fmtMonthIt(yyyy_mm) {
  const [y, m] = yyyy_mm.split('-')
  return `${MONTH_LABELS_SHORT[Number(m) - 1]} ${y.slice(2)}`
}

// Numero di giorni inclusivo tra 2 date ISO (start ≤ end).
// Es: start=end → 1 giorno. start=14/06, end=16/06 → 3 giorni.
function daysBetween(startIso, endIso) {
  if (!startIso || !endIso || startIso > endIso) return 0
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ey, em, ed] = endIso.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
}

export default function StatisticheCoworking() {
  const [endDate, setEndDate] = useState(todayIso())
  const [startDate, setStartDate] = useState(daysAgoIso(30))
  const [bookings, setBookings] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchStats() }, [startDate, endDate])

  async function fetchStats() {
    if (!startDate || !endDate || startDate > endDate) {
      setError('Data inizio deve essere ≤ data fine')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    // bookings.date e' colonna date (no timezone drift). status filter:
    // 'booked' = prenotato futuro, 'confirmed' = check-in fatto, ad oggi
    // gli ingressi "che contano" come presenza/intenzione.
    // subscriptions.created_at e' timestamptz: boundary in UTC, possibile
    // drift di alcune ore al confine giornaliero — accettabile per stats.
    const [b, s] = await Promise.all([
      supabase
        .from('bookings')
        .select('date, status')
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['booked', 'confirmed'])
        .limit(50000),
      supabase
        .from('subscriptions')
        .select('created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z'),
    ])

    if (b.error) {
      console.error('[StatisticheCoworking.bookings]', b.error)
      setError('Errore caricamento ingressi')
      setLoading(false)
      return
    }
    if (s.error) {
      console.error('[StatisticheCoworking.subs]', s.error)
      setError('Errore caricamento abbonamenti')
      setLoading(false)
      return
    }

    setBookings(b.data || [])
    setSubs(s.data || [])
    setLoading(false)
  }

  // Aggregazioni derivate (zero recompute se i raw non cambiano).
  const giorni = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate])
  const totaleIngressi = bookings.length
  const mediaGiorno = giorni > 0 ? totaleIngressi / giorni : 0
  const subVendute = subs.length

  // Media ingressi per giorno della settimana nel periodo.
  // Es: 4 lunedi' con [10,12,8,6] ingressi → media Lun = 9.0
  const perWeekday = useMemo(() => {
    // Quanti giorni di ciascun weekday cadono nel periodo
    const daysCount = [0, 0, 0, 0, 0, 0, 0]
    if (startDate && endDate && startDate <= endDate) {
      const [sy, sm, sd] = startDate.split('-').map(Number)
      const [ey, em, ed] = endDate.split('-').map(Number)
      const cursor = new Date(sy, sm - 1, sd)
      const end = new Date(ey, em - 1, ed)
      while (cursor <= end) {
        daysCount[jsDayToMondayIndex(cursor.getDay())]++
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    // Ingressi raggruppati per weekday
    const ingressiCount = [0, 0, 0, 0, 0, 0, 0]
    for (const b of bookings) {
      if (!b.date) continue
      const [y, m, d] = b.date.split('-').map(Number)
      ingressiCount[jsDayToMondayIndex(new Date(y, m - 1, d).getDay())]++
    }
    return WEEKDAY_LABELS.map((label, i) => ({
      label,
      media: daysCount[i] > 0
        ? Number((ingressiCount[i] / daysCount[i]).toFixed(1))
        : 0,
    }))
  }, [bookings, startDate, endDate])

  // Totale ingressi per mese del periodo. Include i mesi vuoti perche'
  // il line chart abbia continuita' visiva (no gap).
  const perMese = useMemo(() => {
    const map = new Map()
    for (const b of bookings) {
      if (!b.date) continue
      const ym = b.date.slice(0, 7)
      map.set(ym, (map.get(ym) || 0) + 1)
    }
    // Riempie i mesi del periodo che non hanno ingressi
    if (startDate && endDate) {
      const [sy, sm] = startDate.split('-').map(Number)
      const [ey, em] = endDate.split('-').map(Number)
      let y = sy, mo = sm
      while (y < ey || (y === ey && mo <= em)) {
        const key = `${y}-${pad2(mo)}`
        if (!map.has(key)) map.set(key, 0)
        mo++
        if (mo > 12) { mo = 1; y++ }
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, count]) => ({ label: fmtMonthIt(ym), count }))
  }, [bookings, startDate, endDate])

  function applyShortcut(days) {
    setEndDate(todayIso())
    setStartDate(daysAgoIso(days))
  }

  return (
    <div style={{ marginTop: 32 }}>
      {/* HEADER: titolo + date pickers */}
      <div style={S.header}>
        <h3 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Statistiche</h3>
        <div style={S.filters}>
          <div style={S.shortcuts}>
            <button className="btn-ghost" style={S.shortcutBtn} onClick={() => applyShortcut(7)}>7gg</button>
            <button className="btn-ghost" style={S.shortcutBtn} onClick={() => applyShortcut(30)}>30gg</button>
            <button className="btn-ghost" style={S.shortcutBtn} onClick={() => applyShortcut(90)}>90gg</button>
            <button className="btn-ghost" style={S.shortcutBtn} onClick={() => applyShortcut(365)}>365gg</button>
          </div>
          <div style={S.dateGroup}>
            <label style={S.dateLabel}>Dal</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              style={S.dateInput}
            />
          </div>
          <div style={S.dateGroup}>
            <label style={S.dateLabel}>Al</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayIso()}
              onChange={e => setEndDate(e.target.value)}
              style={S.dateInput}
            />
          </div>
        </div>
      </div>

      {/* STATO: error / loading / dati */}
      {error && <div style={S.errorBox}>{error}</div>}

      {loading && !error && (
        <div style={S.loadingBox}>Caricamento statistiche…</div>
      )}

      {!loading && !error && (
        <>
          {/* 3 BOX RIEPILOGATIVI */}
          <div style={S.boxGrid}>
            <StatBox
              label="Totale ingressi"
              value={totaleIngressi.toLocaleString('it-IT')}
              sub={`${giorni} giorn${giorni === 1 ? 'o' : 'i'} nel periodo`}
            />
            <StatBox
              label="Media ingressi/giorno"
              value={mediaGiorno.toFixed(1)}
              sub="presenza media giornaliera"
            />
            <StatBox
              label="Abbonamenti venduti"
              value={subVendute.toLocaleString('it-IT')}
              sub="creati nel periodo"
            />
          </div>

          {/* GRAFICO A — bar chart media ingressi per giorno settimana */}
          <div style={S.chartBox}>
            <div style={S.chartTitle}>Media ingressi per giorno della settimana</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={perWeekday} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                <Tooltip formatter={(v) => [`${v} ingressi`, 'Media']} cursor={{ fill: '#fafafa' }} />
                <Bar dataKey="media" fill="#F5C842" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* GRAFICO B — line chart ingressi per mese (trend stagionale).
              Se il periodo copre meno di 2 mesi mostra un avviso al posto del grafico. */}
          {perMese.length < 2 ? (
            <div style={S.warningBox}>
              Seleziona un periodo di almeno 2 mesi per vedere il grafico dei trend mensili.
            </div>
          ) : (
            <div style={S.chartBox}>
              <div style={S.chartTitle}>Ingressi per mese</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={perMese} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#888' }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} ingressi`, 'Totale']} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#854F0B"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#854F0B' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatBox({ label, value, sub }) {
  return (
    <div style={S.box}>
      <div style={S.boxLabel}>{label}</div>
      <div style={S.boxValue}>{value}</div>
      <div style={S.boxSub}>{sub}</div>
    </div>
  )
}

const S = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, flexWrap: 'wrap', gap: 10,
  },
  filters: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  shortcuts: { display: 'flex', gap: 4 },
  shortcutBtn: { padding: '5px 10px', fontSize: 12 },
  dateGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  dateLabel: { fontSize: 12, color: '#888' },
  dateInput: {
    padding: '6px 10px', border: '0.5px solid #ccc', borderRadius: 8,
    fontSize: 13, background: '#fff', color: '#1a1a1a', fontFamily: 'inherit',
  },
  errorBox: {
    padding: 10, background: '#FEEEEE', color: '#A23B3A',
    borderRadius: 8, fontSize: 13, marginBottom: 14,
  },
  loadingBox: {
    padding: 30, color: '#888', fontSize: 13, textAlign: 'center',
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
  },
  boxGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
    gap: 12, marginBottom: 20,
  },
  box: {
    background: '#fff', border: '0.5px solid #e5e5e5',
    borderRadius: 12, padding: '14px 16px',
  },
  boxLabel: {
    fontSize: 11, color: '#888', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  boxValue: { fontSize: 26, fontWeight: 500 },
  boxSub: { fontSize: 11, color: '#888', marginTop: 3 },
  chartBox: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '14px 16px 8px', marginBottom: 16,
  },
  chartTitle: {
    fontSize: 13, fontWeight: 500, color: '#1a1a1a', marginBottom: 10,
  },
  warningBox: {
    padding: 14, background: '#FAEEDA', color: '#854F0B',
    borderRadius: 12, fontSize: 13, textAlign: 'center', marginBottom: 16,
    border: '0.5px solid #F0DCB0',
  },
}
