import { useState } from 'react'
import { inviaIntermittenti, fmtIntervallo } from '../../../lib/intermittenti'

// Banner "Comunicazioni da inviare" + riepilogo con conferma.
// `stato` arriva da useIntermittenti() (anteprima calcolata dal server).
export default function ComunicazioniBanner({ stato, onInviato, onToast }) {
  const [aperto, setAperto] = useState(false)
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState(null)

  if (!stato) return null
  if (stato.error) {
    return (
      <div style={{ ...box, background: '#FCEBEB', borderColor: '#C5221F', color: '#C5221F' }}>
        Comunicazioni intermittenti non disponibili: {stato.error}
      </div>
    )
  }

  const { comunicazioni, annullamenti } = stato.piano
  const totale = comunicazioni.length + annullamenti.length
  if (totale === 0) return null
  const urgente = comunicazioni.some(r => r.urgente)
  const giaIniziate = annullamenti.some(r => r.gia_iniziata)

  async function conferma() {
    setInvio(true)
    setErrore(null)
    const res = await inviaIntermittenti(stato.impronta)
    setInvio(false)
    if (res.error) { setErrore(res.error); onInviato(); return }
    setAperto(false)
    onToast(res.prova ? 'Invio di PROVA fatto: email solo a ' + stato.mittente : 'Comunicazioni inviate al Ministero')
    onInviato()
  }

  return (
    <>
      <div style={{
        ...box,
        background: urgente ? '#FCEBEB' : '#FAEEDA',
        borderColor: urgente ? '#C5221F' : '#F5B301',
        color: urgente ? '#C5221F' : '#854F0B',
      }}>
        <div>
          <strong>
            {totale === 1 ? '1 comunicazione da inviare' : `${totale} comunicazioni da inviare`}
          </strong>{' '}
          per i lavoratori a chiamata.
          {urgente && <strong> Ci sono turni che iniziano entro domani.</strong>}
        </div>
        <button className="btn-primary" onClick={() => { setErrore(null); setAperto(true) }}>Rivedi e invia</button>
      </div>

      {aperto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ maxWidth: 560, width: '100%', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Comunicazioni da inviare</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 16 }}>
              Controlla le righe. Alla conferma parte l'email da {stato.mittente}.
            </div>

            {stato.prova && (
              <div style={{ ...nota, background: '#E6F1FB', color: '#185FA5' }}>
                <strong>Modalità di prova attiva.</strong> L'email arriva solo a {stato.mittente}, non al
                Ministero, e i turni restano da comunicare.
              </div>
            )}

            {annullamenti.length > 0 && (
              <Sezione titolo="Annullamenti" righe={annullamenti} colore="#C5221F" />
            )}
            {comunicazioni.length > 0 && (
              <Sezione titolo="Comunicazioni" righe={comunicazioni} colore="#111111" />
            )}

            {annullamenti.length > 0 && (
              <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 12 }}>
                Una riga già comunicata a cui è stato tolto un giorno viene annullata per intero; i giorni
                rimasti sono ricomunicati (segnati «sostituisce»).
              </div>
            )}
            {giaIniziate && (
              <div style={{ ...nota, background: '#FCEBEB', color: '#C5221F' }}>
                Stai annullando una comunicazione già iniziata: i giorni già lavorati vengono ricomunicati
                in ritardo. Verifica con il consulente del lavoro prima di inviare.
              </div>
            )}
            {errore && <div style={{ ...nota, background: '#FCEBEB', color: '#C5221F' }}>{errore}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setAperto(false)} disabled={invio}>Chiudi</button>
              <button className="btn-primary" onClick={conferma} disabled={invio}>
                {invio ? 'Invio in corso...' : stato.prova ? 'Conferma e invia (prova)' : 'Conferma e invia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Sezione({ titolo, righe, colore }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colore, marginBottom: 6 }}>{titolo} ({righe.length})</div>
      <div style={{ border: '0.5px solid #E5E3DC', borderRadius: 8 }}>
        {righe.map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            padding: '8px 10px', fontSize: 13,
            borderTop: i ? '0.5px solid #E5E3DC' : 'none',
          }}>
            <div>
              <div style={{ fontWeight: 500 }}>{r.nome}</div>
              <div style={{ fontSize: 11, color: '#6B6B6B' }}>{r.codice_fiscale} · {r.codice_comunicazione}</div>
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {fmtIntervallo(r)}
              {r.urgente && <div style={{ fontSize: 11, color: '#C5221F', fontWeight: 600 }}>entro domani</div>}
              {r.sostituisce && <div style={{ fontSize: 11, color: '#6B6B6B' }}>sostituisce</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const box = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  border: '0.5px solid', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13,
}
const nota = { borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12 }
