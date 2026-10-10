import { useEffect, useMemo, useState } from 'react'
import {
  caricaPendenti, pianificaComunicazioni, spezzaInvii, inviaComunicazione, inviaAnnullamento,
  fmtRigaDate, COSTANTI,
} from '../../../lib/intermittenti'

// "Comunicazioni da inviare": righe raggruppate (giorni consecutivi =
// una riga), spezzate in invii da massimo 10 righe, ognuno col suo
// tasto "Conferma e invia". Niente parte senza il click.
// Usato nella pagina /admin/turni/comunicazioni e nel pannello che si
// apre nel planner dopo il salvataggio di un turno a chiamata.
// Props: onChange() dopo un invio riuscito; compatto (pannello).
export default function RiepilogoComunicazioni({ onChange, compatto = false }) {
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState(null)
  const [busy, setBusy] = useState(null)       // chiave invio in corso
  const [esiti, setEsiti] = useState({})       // chiave -> { ok, msg }

  useEffect(() => { carica() }, [])

  async function carica() {
    const r = await caricaPendenti()
    if (r.error) setErrore(r.error)
    setDati(r)
  }

  const invii = useMemo(() => {
    if (!dati) return []
    const righe = pianificaComunicazioni(dati.shifts, dati.dipendenti)
    const com = spezzaInvii(righe).map((r, i) => ({ chiave: 'c' + i, tipo: 'comunicazione', righe: r }))
    const ann = spezzaInvii(dati.annullamenti).map((r, i) => ({ chiave: 'a' + i, tipo: 'annullamento', righe: r }))
    return [...ann, ...com]
  }, [dati])

  async function invia(inv) {
    setBusy(inv.chiave)
    setEsiti(e => ({ ...e, [inv.chiave]: null }))
    const res = inv.tipo === 'comunicazione'
      ? await inviaComunicazione(inv.righe)
      : await inviaAnnullamento(inv.righe.map(r => r.id))
    setBusy(null)
    if (res.error) {
      setEsiti(e => ({ ...e, [inv.chiave]: { ok: false, msg: res.error } }))
      return
    }
    const dest = res.data?.prova ? `inviato IN PROVA a ${res.data.destinatario}` : `inviato a ${res.data?.destinatario}`
    setEsiti({ ultimo: { ok: true, msg: `${inv.tipo === 'annullamento' ? 'Annullamento' : 'Comunicazione'} ${dest} (${res.data?.righe} righe)` } })
    await carica()
    onChange?.()
  }

  if (errore) return <div className="pill pill-alert">Errore: {errore}</div>
  if (!dati) return <div style={{ padding: 16, color: '#6B6B6B' }}>Caricamento...</div>

  const totRighe = invii.reduce((n, i) => n + i.righe.length, 0)

  return (
    <div>
      {esiti.ultimo?.ok && (
        <div style={{ background: '#EAF3DE', color: '#1E8E3E', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
          {esiti.ultimo.msg}
        </div>
      )}

      {invii.length === 0 ? (
        <div style={{ color: '#6B6B6B', fontSize: 13, padding: compatto ? '4px 0' : 16 }}>
          Nessuna comunicazione da inviare.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10 }}>
            {totRighe} righ{totRighe === 1 ? 'a' : 'e'} in {invii.length} invi{invii.length === 1 ? 'o' : 'i'}
            {invii.length > 1 && ` (massimo ${COSTANTI.maxRighe} righe per invio)`}. Destinatario: {COSTANTI.destinatario}.
          </div>
          {invii.map((inv, idx) => {
            const esito = esiti[inv.chiave]
            const isAnn = inv.tipo === 'annullamento'
            return (
              <div key={inv.chiave} className="card" style={{ marginBottom: 12, padding: 14, borderLeft: `3px solid ${isAnn ? '#C5221F' : '#F5B301'}`, borderRadius: '0 12px 12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {isAnn ? 'Annullamento' : 'Comunicazione'}
                    {invii.length > 1 && <span style={{ color: '#6B6B6B', fontWeight: 400 }}> · invio {idx + 1} di {invii.length}</span>}
                    <span style={{ color: '#6B6B6B', fontWeight: 400 }}> · {inv.righe.length} righ{inv.righe.length === 1 ? 'a' : 'e'}</span>
                  </div>
                  <button className="btn-primary" disabled={busy !== null} onClick={() => invia(inv)}>
                    {busy === inv.chiave ? 'Invio in corso...' : 'Conferma e invia'}
                  </button>
                </div>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Lavoratore</th>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }} className="hide-mobile">{isAnn ? 'Motivo' : 'Giorni'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.righe.map((r, i) => (
                      <tr key={r.id || r.dipendente_id + r.inizio}>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ color: '#aaa', marginRight: 6 }}>{i + 1}.</span>{r.nome}
                          <div style={{ fontSize: 11, color: '#aaa' }}>{r.codice_fiscale}</div>
                        </td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtRigaDate(r)}</td>
                        <td style={{ padding: '6px 8px', color: '#6B6B6B' }} className="hide-mobile">{isAnn ? (r.motivo || '—') : r.giorni}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {esito && !esito.ok && (
                  <div style={{ marginTop: 8, background: '#FCEBEB', color: '#C5221F', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                    {esito.msg}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
