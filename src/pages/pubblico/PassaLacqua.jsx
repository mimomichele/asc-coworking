// ============================================================
// Passa l'Acqua — pagina PUBBLICA di iscrizione (/passa-lacqua).
// Nessun login: il visitatore non ha un account.
//
// Identità visiva dell'EVENTO, non il design system ASC: palette
// acqua (#17A2A0), font Anton/Oswald caricati solo qui. Copy e
// struttura vengono da docs/passa-lacqua-v2.html.
//
// Dati: due sole RPC (vedi supabase/migrations/…passa_lacqua…):
//   passa_lacqua_turni()   → disponibilità, senza nomi
//   passa_lacqua_iscrivi() → invio, upsert per telefono
// Le preferenze NON scrivono nella griglia della staffetta.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizePhone } from '../../lib/exportContatti'

const INTERESSI = ['Nuoto', 'Fitness', 'Yoga e benessere', 'Eventi solidali', 'Open day e prove', 'Altro']
const CANALI = ['Instagram', 'Passaparola', 'Coworking', 'Altro']

// fascia notturna: dalle 23:00 alle 06:00 (esclusa)
const isNotturna = (h) => h >= 23 || h < 6

export default function PassaLacqua() {
  const [turni, setTurni] = useState(null)      // null = caricamento
  const [turniError, setTurniError] = useState(false)

  const [nome, setNome] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [interessi, setInteressi] = useState([])
  const [canale, setCanale] = useState('')
  const [partecipa, setPartecipa] = useState(null)   // null | true | false
  const [scelti, setScelti] = useState([])           // slot_id[]
  const [newsletter, setNewsletter] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [esca, setEsca] = useState('')               // honeypot
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState(false)

  // i font dell'evento si caricano solo qui: il resto dell'app usa
  // i font di sistema (ASC-DESIGN) e non deve pagarne il costo
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@300;400;500;600&display=swap'
    document.head.appendChild(link)
    const prevTitle = document.title
    document.title = "Passa l'Acqua — 24 ore di staffetta di nuoto"
    return () => { document.head.removeChild(link); document.title = prevTitle }
  }, [])

  useEffect(() => { caricaTurni() }, [])

  async function caricaTurni() {
    setTurniError(false)
    const { data, error } = await supabase.rpc('passa_lacqua_turni')
    if (error) {
      console.error('[PassaLacqua turni]', error)
      setTurniError(true)
      return
    }
    setTurni(data.map(t => ({ ...t, inizioDate: new Date(t.inizio) })))
  }

  // Solo i turni liberi, raggruppati per ora; le ore piene spariscono
  // del tutto. Etichette con il giorno perché la griglia attraversa
  // la mezzanotte.
  const gruppi = useMemo(() => {
    if (!turni) return []
    const liberi = turni.filter(t => !t.occupato)
    const out = []
    for (const t of liberi) {
      const d = t.inizioDate
      const key = `${d.getDate()}-${d.getHours()}`
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        const h = d.getHours()
        g = {
          key,
          giorno: d.getDate() === 12 ? 'Sab 12' : 'Dom 13',
          ora: `${String(h).padStart(2, '0')}:00`,
          notturna: isNotturna(h),
          turni: [],
        }
        out.push(g)
      }
      g.turni.push(t)
    }
    return out
  }, [turni])

  function toggleInteresse(v) {
    setInteressi(l => l.includes(v) ? l.filter(x => x !== v) : [...l, v])
  }

  function toggleTurno(id) {
    setScelti(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id])
  }

  // Il contatore vive sulla selezione: azzerando scelti si azzera anche
  // il testo, quindi rispondere "No" non lascia mai un conteggio stale.
  function setPartecipazione(v) {
    setPartecipa(v)
    if (!v) setScelti([])
  }

  const minuti = scelti.length * 10
  const contatore = scelti.length === 0
    ? 'Nessun turno selezionato.'
    : `${scelti.length} ${scelti.length === 1 ? 'turno selezionato' : 'turni selezionati'} — ${minuti} minuti in acqua`

  async function invia(e) {
    e.preventDefault()
    if (invio) return
    setErrore('')

    const nomePulito = nome.trim().replace(/\s+/g, ' ')
    if (nomePulito.split(' ').length < 2) {
      setErrore('Scrivi nome e cognome, servono entrambi per riconoscerti.')
      return
    }
    const tel = normalizePhone(telefono)
    if (!tel) {
      setErrore('Il numero di telefono non sembra valido. Controllalo e riprova.')
      return
    }
    if (partecipa === null) {
      setErrore('Dicci se vuoi partecipare alla 24 ore.')
      return
    }
    if (!privacy) {
      setErrore('Per iscriverti serve il consenso al trattamento dei dati.')
      return
    }

    setInvio(true)
    const { error } = await supabase.rpc('passa_lacqua_iscrivi', {
      p_nome: nomePulito,
      p_telefono: tel,
      p_email: email.trim() || null,
      p_interessi: interessi,
      p_come_conosciuto: canale || null,
      p_partecipa: partecipa,
      p_slot_ids: partecipa ? scelti : [],
      p_newsletter: newsletter,
      p_privacy: privacy,
      p_honeypot: esca,
    })
    setInvio(false)
    if (error) {
      console.error('[PassaLacqua invio]', error)
      setErrore('Non siamo riusciti a registrarti. Riprova fra un momento.')
      return
    }
    setFatto(true)
    window.scrollTo({ top: document.getElementById('iscrizione').offsetTop - 20, behavior: 'smooth' })
  }

  return (
    <div className="pl">
      <style>{CSS}</style>

      <header className="pl-wrap pl-hero">
        <p className="pl-eyebrow">Sab 12 › Dom 13 settembre 2026 · Piscina dell'ASC Hotel</p>
        <h1>Passa<br />l'Acqua</h1>
        <p className="pl-sub">24 ore di staffetta di nuoto</p>
        <p className="pl-payoff">Passa l'acqua a chi viene dopo</p>
        <div className="pl-cta-wrap">
          <a href="#iscrizione" className="pl-cta">Iscriviti ora</a>
          <p className="pl-cta-note">Non serve essere abbonati. Bastano trenta secondi.</p>
        </div>
      </header>

      <section className="pl-wrap">
        <h2>Chiunque può nuotare</h2>
        <p>Per 24 ore consecutive l'acqua non resta mai vuota. Si prenota il proprio turno, si nuota quanto si vuole e si passa il testimone a chi viene dopo. Non serve essere abbonati, non serve essere veloci: serve solo esserci.</p>
        <p>Si parte sabato 12 settembre alle 10:00 e si va avanti fino a domenica alle 10:00, senza mai interrompersi. Anche di notte.</p>
        <p>Chi nuota lascia un'offerta libera. Tutto quello che si raccoglie viene diviso a metà fra due realtà del territorio.</p>

        <div className="pl-split">
          <div className="pl-half">
            <b>50%</b>
            <strong>Calcit</strong>
            <span>Comitato Autonomo Lotta Contro i Tumori</span>
          </div>
          <div className="pl-half">
            <b>50%</b>
            <strong>AllStars</strong>
            <span>Special Olympics</span>
          </div>
        </div>

        <div className="pl-sponsor">
          <b>1 €</b>
          <p>Per ogni 50 metri nuotati, Lapi Chimici aggiunge un euro alla raccolta. Più bracciate facciamo, più cresce la cifra.</p>
        </div>
      </section>

      <section className="pl-wrap">
        <h2>Non solo nuoto</h2>
        <div className="pl-prog">
          <div className="pl-row"><time>Sab 10:00</time><div>Partenza della staffetta<small>Apre anche il bar, aperto per tutte le 24 ore</small></div></div>
          <div className="pl-row"><time>Sab 24:00</time><div>Circolo di lettura<small>Si legge a bordo vasca mentre qualcuno nuota — 5 €</small></div></div>
          <div className="pl-row"><time>Dom 06:45</time><div>Yoga all'alba<small>A bordo piscina, mentre sorge il sole. Ricavato interamente in beneficenza</small></div></div>
          <div className="pl-row"><time>Dom 07:45</time><div>Colazione<small>10 €, per chi ha nuotato e per chi arriva solo adesso</small></div></div>
          <div className="pl-row"><time>Dom 10:00</time><div>Ultima vasca<small>E consegna della somma raccolta</small></div></div>
        </div>
        <div className="pl-cta-wrap"><a href="#iscrizione" className="pl-cta">Iscriviti ora</a></div>
      </section>

      <section id="iscrizione" className="pl-formsec">
        <div className="pl-wrap">
          <div className="pl-formcard">
            {fatto ? (
              <div className="pl-done">
                <h2>Ci sei</h2>
                <p>Ti abbiamo registrato. Se hai scelto dei turni ti ricontattiamo per confermarli.</p>
              </div>
            ) : (
              <>
                <h2>Entra nella community</h2>
                <p className="pl-intro">Passa l'Acqua nasce dalla 24 ore di nuoto solidale, ma vuole andare oltre: creare una community fatta di solidarietà, sport, benessere e nuove iniziative per la città.</p>

                <form onSubmit={invia} noValidate>
                  <fieldset>
                    <legend>Chi sei</legend>

                    <label htmlFor="pl-nome">Nome e cognome <span className="pl-req">*</span></label>
                    <input id="pl-nome" type="text" autoComplete="name" placeholder="Come ti chiami"
                           value={nome} onChange={e => setNome(e.target.value)} />

                    <label htmlFor="pl-tel">Numero di telefono <span className="pl-req">*</span></label>
                    <input id="pl-tel" type="tel" autoComplete="tel" placeholder="Per avvisarti del tuo turno"
                           value={telefono} onChange={e => setTelefono(e.target.value)} />

                    <label htmlFor="pl-mail">Email</label>
                    <input id="pl-mail" type="email" autoComplete="email" placeholder="Per ricevere gli aggiornamenti"
                           value={email} onChange={e => setEmail(e.target.value)} />

                    <label>Quali attività ti interessano?</label>
                    <div className="pl-chips">
                      {INTERESSI.map(v => (
                        <label key={v} className={`pl-chip ${interessi.includes(v) ? 'on' : ''}`}>
                          <input type="checkbox" checked={interessi.includes(v)} onChange={() => toggleInteresse(v)} />
                          <span>{v}</span>
                        </label>
                      ))}
                    </div>

                    <label htmlFor="pl-canale">Come ci hai conosciuto?</label>
                    <select id="pl-canale" value={canale} onChange={e => setCanale(e.target.value)}>
                      <option value="">Preferisco non dirlo</option>
                      {CANALI.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {/* honeypot: invisibile agli umani, i bot lo riempiono */}
                    <div className="pl-esca" aria-hidden="true">
                      <label htmlFor="pl-azienda">Azienda</label>
                      <input id="pl-azienda" type="text" tabIndex={-1} autoComplete="off"
                             value={esca} onChange={e => setEsca(e.target.value)} />
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Partecipa alla 24 ore</legend>

                    <label>Vuoi partecipare alla 24 ore di nuoto solidale del 12–13 settembre? <span className="pl-req">*</span></label>
                    <div className="pl-chips">
                      <label className={`pl-chip ${partecipa === true ? 'on' : ''}`}>
                        <input type="radio" name="pl-partecipa" checked={partecipa === true} onChange={() => setPartecipazione(true)} />
                        <span>Sì</span>
                      </label>
                      <label className={`pl-chip ${partecipa === false ? 'on' : ''}`}>
                        <input type="radio" name="pl-partecipa" checked={partecipa === false} onChange={() => setPartecipazione(false)} />
                        <span>No</span>
                      </label>
                    </div>

                    {partecipa === true && (
                      <div className="pl-slotbox">
                        <label>Quando vuoi nuotare?</label>
                        <p className="pl-note">
                          Ogni turno dura <b>10 minuti</b>. Puoi sceglierne quanti vuoi, anche di seguito: se vuoi nuotare mezz'ora, seleziona tre turni consecutivi.
                          <br /><br />
                          Qui sotto vedi solo i turni ancora liberi. <b>Le fasce indicate rappresentano una preferenza. La partecipazione alla 24 ore sarà confermata dall'organizzazione.</b>
                        </p>

                        {turniError ? (
                          <div className="pl-turni-msg">
                            Non riesco a caricare i turni.{' '}
                            <button type="button" className="pl-link" onClick={caricaTurni}>Riprova</button>
                          </div>
                        ) : turni === null ? (
                          <div className="pl-turni-msg">Carico i turni disponibili…</div>
                        ) : gruppi.length === 0 ? (
                          <div className="pl-turni-msg">Al momento non ci sono turni liberi. Iscriviti lo stesso: ti avvisiamo se si libera qualcosa.</div>
                        ) : (
                          <div className="pl-ore">
                            {gruppi.map(g => (
                              <div key={g.key} className="pl-ora">
                                <p className="pl-ora-tit">
                                  {g.giorno} · {g.ora}
                                  {g.notturna && <span className="pl-notte"> — fascia notturna</span>}
                                </p>
                                <div className="pl-chips">
                                  {g.turni.map(t => (
                                    <label key={t.slot_id} className={`pl-chip ${scelti.includes(t.slot_id) ? 'on' : ''}`}>
                                      <input type="checkbox" checked={scelti.includes(t.slot_id)} onChange={() => toggleTurno(t.slot_id)} />
                                      <span>{t.ora}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="pl-counter">{contatore}</p>
                      </div>
                    )}
                  </fieldset>

                  <fieldset>
                    <legend>Ultima cosa</legend>

                    <label className="pl-check">
                      <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} />
                      <span>Voglio ricevere aggiornamenti sui prossimi eventi e sulle iniziative di Passa l'Acqua</span>
                    </label>

                    <label className="pl-check">
                      <input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} />
                      <span>
                        Acconsento al trattamento dei miei dati personali secondo l'
                        {/* TODO: sostituire con il link all'informativa quando il testo sarà disponibile */}
                        <a href="#privacy" onClick={e => { e.preventDefault(); alert('Informativa privacy in preparazione: sarà pubblicata prima dell\'evento.') }}>informativa privacy</a>
                        {' '}<span className="pl-req">*</span>
                      </span>
                    </label>

                    <button type="submit" disabled={invio}>{invio ? 'Un attimo…' : "Entra in Passa l'Acqua"}</button>
                    {errore && <p className="pl-err">{errore}</p>}
                  </fieldset>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="pl-wrap pl-footer">
        <p>
          Passa l'Acqua — Piscina dell'ASC Hotel · Raccolta divisa fra Calcit e AllStars Special Olympics<br />
          Sponsor principale: Lapi Chimici · #passalacqua
        </p>
      </footer>
    </div>
  )
}

// CSS della sola pagina evento: prefisso pl- per non toccare il resto
// dell'app. Serve un foglio vero (non stili inline) per :focus-within,
// hover e media query.
const CSS = `
.pl{--aqua:#17A2A0;--aqua-dark:#0E7A78;--aqua-pale:#E8F6F5;
  background:#fff;color:#12100F;font-family:'Oswald',sans-serif;font-weight:300;
  min-height:100vh;line-height:1.6;}
.pl *{box-sizing:border-box;}
.pl-wrap{max-width:720px;margin:0 auto;padding:0 22px;}
.pl h1,.pl h2,.pl legend,.pl .pl-cta,.pl button[type=submit]{font-family:'Anton',sans-serif;font-weight:400;}
.pl h1{font-size:clamp(56px,16vw,104px);line-height:.92;letter-spacing:-.5px;margin:6px 0 10px;text-transform:uppercase;}
.pl h2{font-size:clamp(26px,6vw,34px);line-height:1.1;margin:0 0 14px;text-transform:uppercase;}
.pl p{margin:0 0 12px;}
.pl-hero{padding:46px 22px 34px;}
.pl-eyebrow{font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:var(--aqua-dark);font-weight:500;margin:0;}
.pl-sub{font-size:20px;font-weight:400;margin:0 0 2px;}
.pl-payoff{font-size:16px;color:var(--aqua-dark);font-weight:400;font-style:italic;margin:0;}
.pl-cta-wrap{margin:26px 0 0;}
.pl-cta{display:inline-block;background:var(--aqua);color:#fff;text-decoration:none;
  padding:15px 34px;border-radius:999px;font-size:19px;letter-spacing:.5px;text-transform:uppercase;}
.pl-cta:hover{background:var(--aqua-dark);}
.pl-cta-note{font-size:13.5px;color:#5B5754;margin:9px 0 0;}
.pl section{padding:34px 0;}
.pl-split{display:flex;gap:14px;margin:20px 0;flex-wrap:wrap;}
.pl-half{flex:1 1 220px;background:var(--aqua-pale);border-radius:14px;padding:18px;}
.pl-half b{font-family:'Anton',sans-serif;font-size:30px;color:var(--aqua-dark);display:block;line-height:1;}
.pl-half strong{display:block;font-weight:600;font-size:17px;margin-top:6px;}
.pl-half span{font-size:13.5px;color:#5B5754;}
.pl-sponsor{display:flex;gap:14px;align-items:flex-start;border:2px solid var(--aqua);border-radius:14px;padding:18px;}
.pl-sponsor b{font-family:'Anton',sans-serif;font-size:30px;color:var(--aqua-dark);line-height:1;flex:none;}
.pl-sponsor p{margin:0;font-size:15px;}
.pl-prog .pl-row{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #E7E4E1;}
.pl-prog .pl-row:last-child{border-bottom:none;}
.pl-prog time{flex:none;width:92px;color:var(--aqua-dark);font-weight:500;font-size:14.5px;}
.pl-prog small{display:block;color:#5B5754;font-size:13.5px;}
.pl-formsec{background:var(--aqua-pale);padding:34px 0 44px;}
.pl-formcard{background:#fff;border-radius:18px;padding:26px 22px;}
.pl-intro{font-size:15px;color:#4A4644;}
.pl fieldset{border:none;padding:0;margin:0 0 26px;}
.pl legend{font-size:21px;text-transform:uppercase;margin-bottom:12px;}
.pl label{display:block;font-size:14.5px;font-weight:400;margin:14px 0 6px;}
.pl input[type=text],.pl input[type=tel],.pl input[type=email],.pl select{
  width:100%;padding:13px 14px;border:1.5px solid #D9D5D1;border-radius:10px;
  font-family:'Oswald',sans-serif;font-size:16px;font-weight:300;background:#fff;color:#12100F;}
.pl input:focus,.pl select:focus{outline:none;border-color:var(--aqua);box-shadow:0 0 0 3px rgba(23,162,160,.18);}
.pl-req{color:#C5221F;}
.pl-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 2px;}
.pl-chip{display:inline-flex;margin:0;cursor:pointer;}
.pl-chip input{position:absolute;opacity:0;width:0;height:0;}
.pl-chip span{display:inline-block;padding:10px 16px;border:1.5px solid #D9D5D1;border-radius:999px;
  font-size:14.5px;background:#fff;transition:all .12s;}
.pl-chip.on span{background:var(--aqua);border-color:var(--aqua);color:#fff;font-weight:400;}
.pl-chip:hover span{border-color:var(--aqua);}
/* focus da tastiera: l'input è invisibile, l'anello va sullo span */
.pl-chip:focus-within span{outline:3px solid rgba(23,162,160,.45);outline-offset:2px;}
.pl-slotbox{margin-top:8px;}
.pl-note{font-size:13.5px;color:#4A4644;background:#F7F6F4;border-radius:10px;padding:12px 14px;}
.pl-ore{max-height:420px;overflow-y:auto;border:1.5px solid #E7E4E1;border-radius:12px;padding:12px;}
.pl-ora{margin-bottom:14px;}
.pl-ora:last-child{margin-bottom:0;}
.pl-ora-tit{font-size:13px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;color:var(--aqua-dark);margin:0 0 6px;}
.pl-notte{color:#5B5754;font-weight:300;text-transform:none;letter-spacing:0;}
.pl-counter{font-size:14.5px;font-weight:500;color:var(--aqua-dark);margin:12px 0 0;}
.pl-turni-msg{font-size:14.5px;color:#5B5754;padding:14px 0;}
.pl-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0;font-size:14.5px;cursor:pointer;}
.pl-check input{width:22px;height:22px;flex:none;margin-top:2px;accent-color:var(--aqua);}
.pl-check span{font-weight:300;}
.pl-check a{color:var(--aqua-dark);}
.pl button[type=submit]{width:100%;margin-top:18px;background:var(--aqua);color:#fff;border:none;
  border-radius:999px;padding:17px 20px;font-size:20px;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;}
.pl button[type=submit]:hover:not(:disabled){background:var(--aqua-dark);}
.pl button[type=submit]:disabled{opacity:.6;cursor:default;}
.pl-link{background:none;border:none;color:var(--aqua-dark);font-family:inherit;font-size:inherit;
  text-decoration:underline;cursor:pointer;padding:0;}
.pl-err{color:#C5221F;font-size:14.5px;margin-top:10px;}
.pl-done{text-align:center;padding:20px 0;}
.pl-done h2{color:var(--aqua-dark);}
.pl-esca{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
.pl-footer{padding:26px 22px 40px;font-size:13px;color:#5B5754;text-align:center;}
@media(prefers-reduced-motion:reduce){.pl *{transition:none!important;}}
`
