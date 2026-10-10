import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { STATI_COM, turniUrgenti, fmtDataIt } from '../../../lib/intermittenti'
import RiepilogoComunicazioni from './RiepilogoComunicazioni'

// Bordo colorato del chip di un turno in base allo stato di
// comunicazione (solo lavoratori a chiamata; gli altri hanno null).
export function bordoStatoCom(shift, spessore = 2) {
  const st = STATI_COM[shift?.com_stato]
  if (!st) return {}
  return { boxShadow: `inset 0 0 0 ${spessore}px ${st.colore}` }
}

// Legenda compatta degli stati.
export function LegendaStatiCom() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#6B6B6B' }}>
      {['da_comunicare', 'comunicato'].map(k => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#111', boxShadow: `inset 0 0 0 2px ${STATI_COM[k].colore}` }} />
          {STATI_COM[k].label}
        </span>
      ))}
      <span>(lavoratori a chiamata)</span>
    </div>
  )
}

// Avviso ben visibile: turni da comunicare che iniziano entro 24 ore
// (o gia' iniziati). Interroga il DB da solo, cosi' vale per tutta la
// pianificazione e non solo per la settimana a video.
export function AvvisoUrgenti({ dipendenti }) {
  const [urgenti, setUrgenti] = useState([])

  useEffect(() => {
    let alive = true
    async function carica() {
      const chiamata = (dipendenti || []).filter(d => d.a_chiamata)
      if (chiamata.length === 0) { if (alive) setUrgenti([]); return }
      const oggi = new Date()
      const da = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
      const dom = new Date(oggi.getTime() + 2 * 86400000)
      const a = `${dom.getFullYear()}-${String(dom.getMonth() + 1).padStart(2, '0')}-${String(dom.getDate()).padStart(2, '0')}`
      const { data } = await supabase.from('shifts').select('*')
        .eq('com_stato', 'da_comunicare').gte('data', da).lte('data', a)
      if (alive) setUrgenti(turniUrgenti(data || [], chiamata, new Date()))
    }
    carica()
    return () => { alive = false }
  }, [dipendenti])

  if (urgenti.length === 0) return null
  const nomi = new Map((dipendenti || []).map(d => [d.id, [d.nome, d.cognome].filter(Boolean).join(' ')]))
  const righe = urgenti.map(s => `${nomi.get(s.dipendente_id) || '?'} ${fmtDataIt(s.data)} ${String(s.start_time).slice(0, 5)}`)
  return (
    <div style={{
      background: '#FCEBEB', border: '1px solid #F09595', color: '#C5221F', borderRadius: 10,
      padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {urgenti.length === 1 ? 'Un turno a chiamata' : `${urgenti.length} turni a chiamata`} da comunicare entro 24 ore
        </div>
        <div style={{ fontSize: 12, marginTop: 2 }}>{righe.slice(0, 4).join(' · ')}{righe.length > 4 ? ` · +${righe.length - 4}` : ''}</div>
      </div>
      <Link to="/admin/turni/comunicazioni" className="btn-primary" style={{ textDecoration: 'none', background: '#C5221F', color: '#fff' }}>
        Invia ora
      </Link>
    </div>
  )
}

// Pannello modale "Comunicazioni da inviare" che si apre nel planner
// dopo il salvataggio di un turno di un lavoratore a chiamata.
export default function PannelloComunicazioni({ onClose, onChange }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Comunicazioni da inviare</div>
            <div style={{ fontSize: 12, color: '#6B6B6B' }}>Lavoratori a chiamata: controlla le righe e conferma l'invio al Ministero.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <RiepilogoComunicazioni compatto onChange={onChange} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/turni/comunicazioni" style={{ fontSize: 12, color: '#185FA5' }} onClick={onClose}>Vai alla pagina comunicazioni e registro</Link>
          <button className="btn-ghost" onClick={onClose}>Più tardi</button>
        </div>
      </div>
    </div>
  )
}
