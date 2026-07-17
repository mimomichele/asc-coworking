// ============================================================
// StatIngressiOspiti — grafico a linee giornaliero per la
// dashboard globale /admin (DashboardHome).
//
// 2 serie:
//   1. Ingressi in quel giorno: count bookings con date=X
//      status in ('booked','confirmed')
//   2. Ospiti attivi con residuo: ricostruzione storica
//      = membri distinti con almeno un sub tale che
//        - created_at <= X (esisteva)
//        - entries_total > 0 (pacchetto a ingressi)
//        - consumati_fino_a_X < entries_total (residuo positivo)
//
// Il modello reale ASC non ha scadenza temporale sui sub: un sub
// e' esaurito solo quando entries_used = entries_total (la colonna
// expiry_date dello schema iniziale non e' mai stata materializzata
// in produzione). I sub a tempo (entries_total = 0) sono esclusi
// dal conteggio perche' senza scadenza risulterebbero "sempre attivi".
//
// Il flag subscriptions.active non e' storicizzato: se admin
// disattiva oggi un sub, non sappiamo quando. Per questo la linea
// "Ospiti attivi" e' etichettata "stima".
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'

function pad2(n) { return String(n).padStart(2, '0') }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function daysAgoIso(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Array di 'YYYY-MM-DD' inclusivo tra start e end (assume start <= end).
function daysBetween(startIso, endIso) {
  const out = []
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ey, em, ed] = endIso.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  while (cursor <= end) {
    out.push(`${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

// Nome giorno settimana italiano (0=domenica..6=sabato → 0=lun..6=dom)
const DOW_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const DOW_LONG = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

function jsDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// Label asse X: 'gio 09/07'.
function fmtLabelX(day) {
  const [, m, d] = day.split('-')
  return `${DOW_SHORT[jsDay(day)]} ${d}/${m}`
}

// Tooltip label: 'Giovedì 09/07/2026'.
function fmtDateFull(day) {
  const [y, m, d] = day.split('-')
  return `${DOW_LONG[jsDay(day)]} ${d}/${m}/${y}`
}

export default function StatIngressiOspiti() {
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

    // Fetch parallelo — nessuna dipendenza sequenziale.
    // A: bookings fino a end. Per LINEA 1 filtreremo client >= start.
    //    Per LINEA 2 servono anche i bookings precedenti a start per
    //    contare i consumati_fino_a_X.
    // B: sub creati entro end AND a ingressi (entries_total > 0).
    //    Il modello reale non ha expiry_date: la scadenza e' solo
    //    per consumo. Sub 'time' (entries_total=0) esclusi.
    //
    // NB su bookings: uso pagination esplicita con .range() perche'
    // PostgREST clampa .limit() al max_rows del server (tipicamente
    // 1000), quindi limit(50000) verrebbe silenziosamente ridotto
    // e i piu' recenti sparirebbero dal grafico.
    const [bookingsRes, s] = await Promise.all([
      fetchAllBookings(endDate),
      supabase
        .from('subscriptions')
        .select('id, member_id, entries_total, created_at')
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .gt('entries_total', 0),
    ])

    if (bookingsRes.error) {
      console.error('[StatIngressiOspiti.bookings]', bookingsRes.error)
      setError('Errore caricamento ingressi')
      setLoading(false)
      return
    }
    if (s.error) {
      console.error('[StatIngressiOspiti.subs]', s.error)
      setError('Errore caricamento abbonamenti')
      setLoading(false)
      return
    }

    setBookings(bookingsRes.data || [])
    setSubs(s.data || [])
    setLoading(false)
  }

  // Pagination esplicita: recupera TUTTI i bookings fino a endDate,
  // in chunk da 1000 (il default max_rows di PostgREST). Safety cap
  // a 50k righe per evitare loop infiniti.
  async function fetchAllBookings(endDate) {
    const CHUNK = 1000
    let all = []
    let from = 0
    while (from < 50000) {
      const { data, error } = await supabase
        .from('bookings')
        .select('subscription_id, date, status')
        .lte('date', endDate)
        .in('status', ['booked', 'confirmed'])
        .order('date', { ascending: true })
        .range(from, from + CHUNK - 1)
      if (error) return { data: null, error }
      if (!data || data.length === 0) break
      all = all.concat(data)
      if (data.length < CHUNK) break
      from += CHUNK
    }
    return { data: all, error: null }
  }

  // Aggregazioni derivate. Recompute solo se dati raw o periodo cambiano.
  const chartData = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return []
    const days = daysBetween(startDate, endDate)

    // LINEA 1: conteggio bookings per data nel periodo.
    const ingressiByDate = new Map()
    for (const bk of bookings) {
      if (!bk.date || bk.date < startDate || bk.date > endDate) continue
      ingressiByDate.set(bk.date, (ingressiByDate.get(bk.date) || 0) + 1)
    }

    // LINEA 2: pre-group bookings per subscription_id per lookup rapido.
    const bookingsBySub = new Map()
    for (const bk of bookings) {
      if (!bk.subscription_id || !bk.date) continue
      if (!bookingsBySub.has(bk.subscription_id)) bookingsBySub.set(bk.subscription_id, [])
      bookingsBySub.get(bk.subscription_id).push(bk.date)
    }

    return days.map(day => {
      const activeMembers = new Set()
      for (const sub of subs) {
        // Sub esisteva quel giorno? (already filtered entries_total>0
        // dal fetch, quindi qui sappiamo che e' pacchetto a ingressi)
        const createdDay = sub.created_at ? sub.created_at.slice(0, 10) : null
        if (!createdDay || createdDay > day) continue
        // Residuo positivo al giorno X?
        const subBookings = bookingsBySub.get(sub.id) || []
        const consumed = subBookings.filter(d => d <= day).length
        if (consumed >= sub.entries_total) continue
        activeMembers.add(sub.member_id)
      }
      return {
        date: day,
        label: fmtLabelX(day),
        ingressi: ingressiByDate.get(day) || 0,
        ospitiAttivi: activeMembers.size,
      }
    })
  }, [bookings, subs, startDate, endDate])

  function applyShortcut(n) {
    setEndDate(todayIso())
    setStartDate(daysAgoIso(n))
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <h3 style={S.title}>
          Ingressi e ospiti attivi
          <span style={S.badgeStima} title="Ospiti attivi = membri con almeno un abbonamento a ingressi ancora con residuo al giorno X. Ricostruito da created_at + ingressi consumati (non abbiamo storico di disattivazioni manuali ne' scadenze temporali; i sub a tempo sono esclusi).">
            stima
          </span>
        </h3>
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

      {error && <div style={S.errorBox}>{error}</div>}
      {loading && !error && <div style={S.loadingBox}>Caricamento…</div>}

      {!loading && !error && (
        <div style={S.chartBox}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#888' }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis tick={{ fontSize: 12, fill: '#888' }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(label, payload) => {
                  if (payload?.length > 0) return fmtDateFull(payload[0].payload.date)
                  return label
                }}
                formatter={(value, name) => [
                  value,
                  name === 'ingressi' ? 'Ingressi' : 'Ospiti attivi',
                ]}
              />
              <Legend
                formatter={value => value === 'ingressi' ? 'Ingressi' : 'Ospiti attivi'}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="ingressi"
                stroke="#F5C842"
                strokeWidth={2}
                dot={{ r: 3, fill: '#F5C842' }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="ospitiAttivi"
                stroke="#854F0B"
                strokeWidth={2}
                dot={{ r: 3, fill: '#854F0B' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap: { marginTop: 8, marginBottom: 24 },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, flexWrap: 'wrap', gap: 10,
  },
  title: {
    fontSize: 16, fontWeight: 500, margin: 0,
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  },
  badgeStima: {
    fontSize: 10, padding: '2px 8px', borderRadius: 6,
    background: '#f0f0f0', color: '#888', fontWeight: 500,
    letterSpacing: 0.3, textTransform: 'uppercase',
    cursor: 'help',
  },
  filters: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
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
  chartBox: {
    background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12,
    padding: '14px 16px 8px',
  },
}
