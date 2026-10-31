// ============================================================
// Preventivi > Statistiche
//
// Un fetch solo di tutte le richieste (paginato a blocchi di 1000:
// PostgREST clampa .limit() a 1000) e aggregazione client-side in
// src/lib/preventiviStat.js, cosi' cambiare periodo e' istantaneo.
//
// Il periodo filtra su data_ricevuta (calendario Europe/Rome) e vale
// per KPI e grafici. La tabella "Prossimi arrivi confermati" guarda
// sempre avanti da oggi, qualunque sia il periodo scelto.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, LabelList,
  CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../../lib/supabase'
import {
  TIPOLOGIE, CANALI, fmtEuro, fmtDataRange, etichettaContatto, tipologiaLabel,
} from '../../../lib/preventivi'
import {
  PRESET, intervalloPreset, oggiRoma, filtraPeriodo, kpi, perMese,
  perCategoria, motiviPerdita, prossimiArrivi, fmtDurata, fmtPct,
} from '../../../lib/preventiviStat'

const SELECT = `
  id, tipologia, canale, stato, data_ricevuta, data_invio, data_chiusura,
  data_arrivo, data_partenza, n_persone, importo_preventivo, motivo_perdita,
  contatto:contatti!inner(nome, cognome, societa_ente)
`
const PAGINA = 1000

// Colori degli esiti nei grafici impilati. Verde e rosso sono quelli
// dei badge; grigio e giallo sono scuriti per leggere su bianco.
// Ordine nello stack scelto perche' verde e rosso non siano mai
// adiacenti (daltonismo rosso-verde).
const ESITI = [
  { key: 'confermata', label: 'Confermate', fill: '#1E8E3E' },
  { key: 'scaduta',    label: 'Scadute',    fill: '#A09B8F' },
  { key: 'persa',      label: 'Perse',      fill: '#C5221F' },
  { key: 'aperta',     label: 'Aperte',     fill: '#E0A400' },
]
const AMBRA = '#854F0B'

// Per i KPI niente centesimi, cosi' "182.800 €" sta in una card stretta.
function fmtEuroIntero(n) {
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return num.toLocaleString('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

// true sotto i 640px (stesso breakpoint di .hide-mobile in index.css).
function useMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = e => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

// "Raduno / gruppo sportivo" → "Raduno": sull'asse Y c'e' poco spazio.
const TIPOLOGIE_BREVI = TIPOLOGIE.map(t => ({
  key: t.key, label: t.label.split(' / ')[0].split(' o ')[0],
}))
const tipologiaBreve = (k) => TIPOLOGIE_BREVI.find(t => t.key === k)?.label ?? k

async function fetchTutte() {
  let da = 0
  let tutte = []
  for (;;) {
    const { data, error } = await supabase
      .from('richieste_preventivo')
      .select(SELECT)
      .order('data_ricevuta', { ascending: false })
      .order('id')
      .range(da, da + PAGINA - 1)
    if (error) throw error
    tutte = tutte.concat(data || [])
    if (!data || data.length < PAGINA) break
    da += PAGINA
  }
  return tutte
}

export default function Statistiche() {
  const [righe, setRighe] = useState(null)
  const [err, setErr] = useState('')
  const [preset, setPreset] = useState('anno')
  const [range, setRange] = useState(() => intervalloPreset('anno'))
  const mobile = useMobile()

  useEffect(() => { carica() }, [])

  async function carica() {
    setErr('')
    try {
      setRighe(await fetchTutte())
    } catch (e) {
      setErr(e?.code === '42P01'
        ? 'Le tabelle Preventivi non esistono: applica la migrazione.'
        : 'Errore nel caricamento. Riprova.')
    }
  }

  function scegliPreset(k) { setPreset(k); setRange(intervalloPreset(k)) }
  function scegliData(campo, v) { setPreset('custom'); setRange(r => ({ ...r, [campo]: v })) }

  const oggi = oggiRoma()
  const nelPeriodo = useMemo(() => righe ? filtraPeriodo(righe, range) : [], [righe, range])
  const k = useMemo(() => kpi(nelPeriodo), [nelPeriodo])
  const mesi = useMemo(() => perMese(nelPeriodo, range), [nelPeriodo, range])
  const tipologie = useMemo(() => perCategoria(nelPeriodo, 'tipologia', TIPOLOGIE_BREVI), [nelPeriodo])
  const canali = useMemo(() => perCategoria(nelPeriodo, 'canale', CANALI), [nelPeriodo])
  const motivi = useMemo(() => motiviPerdita(nelPeriodo), [nelPeriodo])
  const arrivi = useMemo(() => righe ? prossimiArrivi(righe, oggi) : [], [righe, oggi])

  if (err) return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>{err}</div>
      <button className="btn-ghost" onClick={carica}>Riprova</button>
    </div>
  )
  if (righe === null) return <div style={{ padding: 20, color: '#6B6B6B' }}>Caricamento…</div>

  const vuoto = nelPeriodo.length === 0

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Statistiche</h2>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 12 }}>
        Il periodo si applica alla data in cui la richiesta è stata ricevuta.
        {' '}{righe.length} richiest{righe.length === 1 ? 'a' : 'e'} in archivio.
      </div>

      {/* Selettore periodo */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={S.presetRow}>
          {PRESET.map(p => (
            <button key={p.key} type="button" onClick={() => scegliPreset(p.key)}
                    style={{ ...S.presetBtn, ...(preset === p.key ? S.presetBtnAttivo : {}) }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={S.dateRow}>
          <span style={S.labelSmall}>Dal</span>
          <input type="date" value={range.da} max={range.a || undefined}
                 onChange={e => scegliData('da', e.target.value)} style={S.inputDate} />
          <span style={S.labelSmall}>Al</span>
          <input type="date" value={range.a} min={range.da || undefined}
                 onChange={e => scegliData('a', e.target.value)} style={S.inputDate} />
          <span style={{ ...S.labelSmall, marginLeft: 'auto' }}>
            {nelPeriodo.length} richiest{nelPeriodo.length === 1 ? 'a' : 'e'} nel periodo
          </span>
        </div>
      </div>

      {/* KPI */}
      <div style={S.kpiGrid}>
        <Kpi label="Richieste ricevute" value={k.ricevute}
             sub={`${k.perse} pers${k.perse === 1 ? 'a' : 'e'} · ${k.scadute} scadut${k.scadute === 1 ? 'a' : 'e'}`} />
        <Kpi label="Confermate" value={k.confermate}
             sub={k.chiuse
               ? `conversione ${fmtPct(k.conversione)} su ${k.chiuse} chius${k.chiuse === 1 ? 'a' : 'e'}`
               : 'nessuna richiesta chiusa'} />
        <Kpi label="Importo confermato" value={fmtEuroIntero(k.importoConfermato)}
             sub={k.importoMedio != null ? `media ${fmtEuroIntero(k.importoMedio)}` : 'nessun importo confermato'} />
        <Kpi label="Prima risposta" value={fmtDurata(k.oreRisposta)}
             sub={k.nRisposte
               ? `media su ${k.nRisposte} preventiv${k.nRisposte === 1 ? 'o inviato' : 'i inviati'}`
               : 'nessun preventivo inviato'} />
        <Kpi label="Ancora aperte" value={k.aperte}
             sub={`in sospeso ${fmtEuroIntero(k.importoSospeso)}`} />
      </div>

      {vuoto ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: '#6B6B6B', fontSize: 13, marginBottom: 16 }}>
          Nessuna richiesta ricevuta nel periodo selezionato.
          <div style={{ marginTop: 8 }}>
            <button className="btn-ghost" type="button" onClick={() => scegliPreset('tutto')}>
              Mostra tutto il periodo
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Richieste per mese */}
          <div className="card" style={S.chartCard}>
            <div style={S.chartTitle}>Richieste per mese</div>
            <div style={S.chartSub}>Per mese di ricezione, impilate per esito. Aperte = ricevute, inviate o in attesa.</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={mesi} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="#EEEDE8" />
                <XAxis dataKey="label" tick={S.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={S.tick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#F6F5F1' }} content={<TooltipEsiti />} />
                {ESITI.map(e => (
                  <Bar key={e.key} dataKey={e.key} name={e.label} stackId="esito"
                       fill={e.fill} stroke="#fff" strokeWidth={1} maxBarSize={34} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <Legenda />
          </div>

          {/* Tipologia e canale */}
          <div style={S.dueColonne}>
            <CategoriaChart titolo="Per tipologia" righe={tipologie} />
            <CategoriaChart titolo="Per canale" righe={canali} />
          </div>

          {/* Motivi di perdita */}
          <div className="card" style={S.chartCard}>
            <div style={S.chartTitle}>Motivi di perdita</div>
            <div style={S.chartSub}>
              {k.perse
                ? `${k.perse} richiest${k.perse === 1 ? 'a persa' : 'e perse'} nel periodo, per motivo.`
                : 'Richieste perse nel periodo, per motivo.'}
            </div>
            {motivi.length === 0 ? (
              <Vuoto testo="Nessuna richiesta persa nel periodo. Bene così." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(90, motivi.length * 40 + 20)}>
                <BarChart data={motivi} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={150} tick={S.tick} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#F6F5F1' }} contentStyle={S.tooltip} formatter={(v) => [v, 'Richieste']} />
                  <Bar dataKey="n" name="Richieste" fill={AMBRA} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                    <LabelList dataKey="n" position="right" offset={8} style={{ fontSize: 12, fill: '#111' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}

      {/* Prossimi arrivi confermati */}
      <div className="card" style={{ ...S.chartCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px' }}>
          <div style={S.chartTitle}>Prossimi arrivi confermati</div>
          <div style={{ ...S.chartSub, marginBottom: 0 }}>
            Da oggi in avanti, indipendentemente dal periodo scelto.
            {arrivi.length > 0 && (
              <> {arrivi.length} arriv{arrivi.length === 1 ? 'o' : 'i'} ·{' '}
                {arrivi.reduce((s, r) => s + Number(r.n_persone || 0), 0)} persone ·{' '}
                {fmtEuro(arrivi.reduce((s, r) => s + Number(r.importo_preventivo || 0), 0))}</>
            )}
          </div>
        </div>
        {arrivi.length === 0 ? (
          <div style={{ ...S.vuoto, borderTop: '0.5px solid #E5E3DC' }}>Nessun arrivo confermato in programma.</div>
        ) : mobile ? (
          <div>
            {arrivi.map(r => <ArrivoCard key={r.id} r={r} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderTop: '0.5px solid #E5E3DC' }}>
            <table>
              <thead>
                <tr>
                  <th>Contatto</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Persone</th>
                  <th style={{ textAlign: 'right' }}>Importo</th>
                </tr>
              </thead>
              <tbody>
                {arrivi.map(r => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/admin/preventivi/richiesta/${r.id}`} style={S.link}>
                        {etichettaContatto(r.contatto)}
                      </Link>
                      <div style={S.sottoriga}>{tipologiaLabel(r.tipologia)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDataRange(r.data_arrivo, r.data_partenza)}</td>
                    <td style={{ textAlign: 'right' }}>{r.n_persone ?? '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(r.importo_preventivo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Barre orizzontali impilate per esito, con "totale · conversione" a
// destra di ogni barra.
function CategoriaChart({ titolo, righe }) {
  const altezza = Math.max(100, righe.length * 44 + 20)
  return (
    <div className="card" style={{ ...S.chartCard, marginBottom: 0 }}>
      <div style={S.chartTitle}>{titolo}</div>
      <div style={S.chartSub}>Richieste e tasso di conversione (confermate su chiuse).</div>
      {righe.length === 0 ? (
        <Vuoto testo="Nessun dato nel periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={altezza}>
          <BarChart data={righe} layout="vertical" margin={{ top: 4, right: 76, left: 0, bottom: 0 }} barCategoryGap="28%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={110} tick={S.tick} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#F6F5F1' }} content={<TooltipEsiti conversione />} />
            {ESITI.map((e, i) => (
              <Bar key={e.key} dataKey={e.key} name={e.label} stackId="esito"
                   fill={e.fill} stroke="#fff" strokeWidth={1} maxBarSize={22} isAnimationActive={false}>
                {i === ESITI.length - 1 && (
                  <LabelList dataKey="totale" position="right"
                             content={(p) => <EtichettaTotale {...p} righe={righe} />} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <Legenda />
    </div>
  )
}

// Etichetta a fine barra: "12 · 40%". Recharts ripete x/y/width/height
// del segmento come props di primo livello.
function EtichettaTotale({ x, y, width, height, index, righe }) {
  const r = righe[index]
  if (!r || x == null) return null
  return (
    <text x={x + width + 8} y={y + height / 2} dy={4} fontSize={12} fill="#111111">
      {r.totale}{r.conversione != null ? ` · ${fmtPct(r.conversione)}` : ''}
    </text>
  )
}

function TooltipEsiti({ active, payload, label, conversione }) {
  if (!active || !payload?.length) return null
  const riga = payload[0]?.payload || {}
  return (
    <div style={S.tooltip}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {ESITI.map(e => riga[e.key] ? (
        <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: e.fill, display: 'inline-block' }} />
          <span style={{ color: '#6B6B6B' }}>{e.label}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 10 }}>{riga[e.key]}</span>
        </div>
      ) : null)}
      <div style={{ borderTop: '0.5px solid #E5E3DC', marginTop: 4, paddingTop: 4, display: 'flex' }}>
        <span style={{ color: '#6B6B6B' }}>Totale</span>
        <span style={{ marginLeft: 'auto', paddingLeft: 10 }}>{riga.totale}</span>
      </div>
      {conversione && riga.conversione != null && (
        <div style={{ display: 'flex' }}>
          <span style={{ color: '#6B6B6B' }}>Conversione</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 10 }}>{fmtPct(riga.conversione)}</span>
        </div>
      )}
    </div>
  )
}

function Legenda() {
  return (
    <div style={S.legenda}>
      {ESITI.map(e => (
        <span key={e.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: e.fill, display: 'inline-block' }} />
          {e.label}
        </span>
      ))}
    </div>
  )
}

// Riga "prossimo arrivo" su telefono: la tabella a 4 colonne non ci sta.
function ArrivoCard({ r }) {
  return (
    <Link to={`/admin/preventivi/richiesta/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={S.arrivoCard}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0 }}>{etichettaContatto(r.contatto)}</span>
          <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtEuro(r.importo_preventivo)}</span>
        </div>
        <div style={S.sottoriga}>
          {fmtDataRange(r.data_arrivo, r.data_partenza)}
          {r.n_persone ? ` · ${r.n_persone} persone` : ''}
          {' · '}{tipologiaBreve(r.tipologia)}
        </div>
      </div>
    </Link>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card" style={S.kpi}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue}>{value}</div>
      <div style={S.kpiSub}>{sub}</div>
    </div>
  )
}

function Vuoto({ testo }) {
  return <div style={S.vuoto}>{testo}</div>
}

const S = {
  presetRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  presetBtn: {
    padding: '5px 11px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
    border: '0.5px solid #ccc', background: '#fff', color: '#6B6B6B', fontFamily: 'inherit',
  },
  presetBtnAttivo: { background: '#F5B301', border: '0.5px solid #F5B301', color: '#111111', fontWeight: 500 },
  dateRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  labelSmall: { fontSize: 11.5, color: '#6B6B6B' },
  inputDate: {
    padding: '5px 8px', fontSize: 13, border: '0.5px solid #ccc', borderRadius: 7,
    background: '#fff', fontFamily: 'inherit',
  },
  kpiGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10, marginBottom: 16,
  },
  kpi: { padding: '12px 14px' },
  kpiLabel: { fontSize: 11, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: 600, lineHeight: 1.15, overflowWrap: 'anywhere' },
  kpiSub: { fontSize: 11.5, color: '#6B6B6B', marginTop: 4 },
  chartCard: { padding: '14px 16px 10px', marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: 600, marginBottom: 2 },
  chartSub: { fontSize: 12, color: '#6B6B6B', marginBottom: 10 },
  dueColonne: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
    gap: 16, marginBottom: 16,
  },
  tick: { fontSize: 12, fill: '#6B6B6B' },
  tooltip: {
    fontSize: 12, background: '#fff', padding: '8px 10px', borderRadius: 8,
    border: '0.5px solid #E5E3DC', minWidth: 140,
  },
  legenda: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#6B6B6B', marginTop: 6 },
  vuoto: { padding: '18px 12px', fontSize: 13, color: '#6B6B6B', textAlign: 'center' },
  link: { color: '#111111', fontWeight: 600, textDecoration: 'none' },
  arrivoCard: { padding: '10px 14px', borderTop: '0.5px solid #E5E3DC' },
  sottoriga: { fontSize: 11.5, color: '#6B6B6B' },
}
