// ============================================================
// Passa l'Acqua — pagina PUBBLICA di prenotazione (/passa-lacqua).
// Nessun login: il visitatore non ha un account.
//
// Identità visiva dell'EVENTO, non il design system ASC: palette
// acqua (#17A2A0), font Anton/Oswald caricati solo qui.
//
// Struttura pensata per il telefono, in tre passi sulla stessa
// pagina, nell'ordine in cui una persona ragiona:
//   1. Cosa vuoi fare   → card: nuotare e/o gli eventi collaterali
//   2. Quando nuoti     → solo se ha scelto di nuotare: chip da
//                          10 minuti divisi per giorno e per ora
//   3. I tuoi dati      → nome e telefono, email facoltativa,
//                          consensi
// I dati personali arrivano per ULTIMI: prima si sceglie, poi ci
// si presenta. Sopra al bottone un riepilogo in parole di quello
// che si sta chiedendo.
//
// Dati: due sole RPC (vedi supabase/migrations/…passa_lacqua…):
//   passa_lacqua_turni()   → disponibilità, senza nomi
//   passa_lacqua_iscrivi() → invio, upsert per telefono
// Le preferenze NON scrivono nella griglia della staffetta.
// I campi interessi / come_conosciuto restano nel DB e nella RPC
// ma la pagina non li chiede più: si inviano vuoti.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizePhone } from '../../lib/exportContatti'

// Eventi collaterali che richiedono l'iscrizione (niente slot:
// solo l'evento e in quanti si viene). Le chiavi sono quelle del
// CHECK di passa_lacqua_eventi_richiesti — non cambiarle da sole.
const EVENTI = [
  { key: 'letture',   nome: 'Reading a bordo piscina', quando: 'Sabato 19:30',            desc: 'Si legge a bordo vasca mentre qualcuno nuota' },
  { key: 'yoga',      nome: "Yoga all'alba",           quando: 'Domenica 6:30',           desc: 'A bordo piscina, mentre sorge il sole' },
  { key: 'colazione', nome: 'Colazione Wellness',      quando: 'Domenica, dopo lo yoga',  desc: 'Per chi ha nuotato e per chi arriva solo adesso' },
]
const MAX_PERSONE = 10

// fascia notturna: dalle 23:00 alle 06:00 (esclusa)
const isNotturna = (h) => h >= 23 || h < 6

const hh = (n) => String(n).padStart(2, '0')

export default function PassaLacqua() {
  const [turni, setTurni] = useState(null)      // null = caricamento
  const [turniError, setTurniError] = useState(false)

  const [nuota, setNuota] = useState(false)          // card "Nuotare"
  const [scelti, setScelti] = useState([])           // slot_id[]
  const [giorno, setGiorno] = useState(12)           // tab del selettore turni
  const [eventi, setEventi] = useState({})           // { letture: 2, … } — assente = non iscritto

  const [nome, setNome] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
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

  // Tutti i turni del giorno scelto, raggruppati per ora: una riga
  // per ora, sei chip sempre nella stessa posizione. I turni presi
  // restano visibili ma spenti, così si capisce perché mancano.
  const gruppi = useMemo(() => {
    if (!turni) return []
    const delGiorno = turni.filter(t => t.inizioDate.getDate() === giorno)
    const out = []
    for (const t of delGiorno) {
      const h = t.inizioDate.getHours()
      let g = out[out.length - 1]
      if (!g || g.h !== h) {
        g = { h, ora: `Ore ${hh(h)}`, notturna: isNotturna(h), turni: [] }
        out.push(g)
      }
      g.turni.push(t)
    }
    return out
  }, [turni, giorno])

  // quanti turni liberi ha ciascun giorno: va sulle tab, così chi
  // apre la pagina capisce subito dove c'è posto
  const liberiPerGiorno = useMemo(() => {
    const c = { 12: 0, 13: 0 }
    for (const t of turni || []) if (!t.occupato) c[t.inizioDate.getDate()] += 1
    return c
  }, [turni])

  const sceltiOrdinati = useMemo(() => {
    if (!turni) return []
    return turni.filter(t => scelti.includes(t.slot_id)).sort((a, b) => a.inizioDate - b.inizioDate)
  }, [turni, scelti])

  function toggleNuota() {
    setNuota(v => {
      if (v) setScelti([])   // togliere "Nuotare" azzera anche i turni
      return !v
    })
  }

  function toggleTurno(id) {
    setScelti(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id])
  }

  // spuntare un evento lo iscrive per 1 persona; togliere la spunta
  // cancella anche il numero, così non resta un conteggio orfano
  function toggleEvento(key) {
    setEventi(ev => {
      if (key in ev) {
        const { [key]: _via, ...resto } = ev
        return resto
      }
      return { ...ev, [key]: 1 }
    })
  }

  function cambiaPersone(key, delta) {
    setEventi(ev => ({ ...ev, [key]: Math.min(MAX_PERSONE, Math.max(1, (ev[key] || 1) + delta)) }))
  }

  const haScelto = nuota || Object.keys(eventi).length > 0
  const nStepDati = nuota ? 3 : 2

  // "Sab 12 · 21:00, 21:10" — testo del riepilogo e della conferma
  const riepilogo = useMemo(() => {
    const righe = []
    if (nuota) {
      if (sceltiOrdinati.length === 0) {
        righe.push({ k: 'nuoto', txt: 'Nuoti nella staffetta', sub: 'scegli almeno un turno qui sopra', warn: true })
      } else {
        const perGiorno = {}
        for (const t of sceltiOrdinati) {
          const d = t.inizioDate.getDate()
          ;(perGiorno[d] ||= []).push(`${hh(t.inizioDate.getHours())}:${hh(t.inizioDate.getMinutes())}`)
        }
        const parti = Object.entries(perGiorno).map(([d, ore]) => `${d === '12' ? 'sab' : 'dom'} ${ore.join(', ')}`)
        righe.push({ k: 'nuoto', txt: `Nuoti ${sceltiOrdinati.length * 10} minuti`, sub: parti.join(' · ') })
      }
    }
    for (const ev of EVENTI) {
      if (ev.key in eventi) {
        const n = eventi[ev.key]
        righe.push({ k: ev.key, txt: ev.nome, sub: `${ev.quando} · ${n === 1 ? '1 persona' : `${n} persone`}` })
      }
    }
    return righe
  }, [nuota, sceltiOrdinati, eventi])

  async function invia(e) {
    e.preventDefault()
    if (invio) return
    setErrore('')

    if (!haScelto) {
      setErrore('Scegli almeno una cosa da fare: nuotare o uno degli eventi.')
      return
    }
    if (nuota && scelti.length === 0) {
      setErrore('Hai scelto di nuotare: indica almeno un turno.')
      return
    }
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
    if (!privacy) {
      setErrore('Per prenotare serve il consenso al trattamento dei dati.')
      return
    }

    setInvio(true)
    const { error } = await supabase.rpc('passa_lacqua_iscrivi', {
      p_nome: nomePulito,
      p_telefono: tel,
      p_email: email.trim() || null,
      p_interessi: [],
      p_come_conosciuto: null,
      p_partecipa: nuota,
      p_slot_ids: nuota ? scelti : [],
      p_eventi: eventi,
      p_newsletter: newsletter,
      p_privacy: privacy,
      p_honeypot: esca,
    })
    setInvio(false)
    if (error) {
      console.error('[PassaLacqua invio]', error)
      setErrore('Non siamo riusciti a registrare la richiesta. Riprova fra un momento.')
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
        <p className="pl-sub">24 ore di staffetta di nuoto per Calcit e AllStars</p>
        <p className="pl-payoff">Passa l'acqua a chi viene dopo</p>
        <div className="pl-cta-wrap">
          <a href="#iscrizione" className="pl-cta">Prenota il tuo posto</a>
          <p className="pl-cta-note">Non serve essere abbonati. Bastano trenta secondi.</p>
        </div>
      </header>

      <section className="pl-wrap pl-come">
        <h2>Come funziona</h2>
        <ol className="pl-mosse">
          <li><b>1</b><div><strong>Scegli cosa fare.</strong> Nuotare dieci minuti (o di più) nella staffetta, venire agli eventi a bordo piscina, o tutte e due le cose.</div></li>
          <li><b>2</b><div><strong>Lascia nome e telefono.</strong> Niente account, niente password.</div></li>
          <li><b>3</b><div><strong>Ti confermiamo noi.</strong> Ti scriviamo su WhatsApp con il tuo turno.</div></li>
        </ol>
        <div className="pl-causa">
          <p><b>Chi nuota lascia un'offerta libera.</b> Tutto quello che si raccoglie va metà a <strong>Calcit</strong> e metà ad <strong>AllStars Special Olympics</strong>. E per ogni 50 metri nuotati <strong>Lapi Chimici</strong> aggiunge un euro.</p>
        </div>
      </section>

      <section id="iscrizione" className="pl-formsec">
        <div className="pl-wrap">
          <div className="pl-formcard">
            {fatto ? (
              <div className="pl-done">
                <h2>Ci sei</h2>
                <p>Abbiamo ricevuto la tua richiesta:</p>
                <ul className="pl-done-list">
                  {riepilogo.map(r => <li key={r.k}><strong>{r.txt}</strong><small>{r.sub}</small></li>)}
                </ul>
                <p>Ti scriviamo su WhatsApp per confermare. A presto in acqua.</p>
              </div>
            ) : (
              <form onSubmit={invia} noValidate>

                {/* ---- passo 1: cosa vuoi fare ---- */}
                <fieldset>
                  <legend><span className="pl-num">1</span>Cosa vuoi fare?</legend>
                  <p className="pl-hint">Puoi scegliere più di una cosa.</p>

                  <div className="pl-cards">
                    <label className={`pl-card ${nuota ? 'on' : ''}`}>
                      <input type="checkbox" checked={nuota} onChange={toggleNuota} />
                      <span className="pl-card-box" aria-hidden="true" />
                      <span className="pl-card-txt">
                        <b>Nuotare nella staffetta</b>
                        <small>Da sabato 10:00 a domenica 10:00, anche di notte</small>
                        <em>Turni da 10 minuti · offerta libera</em>
                      </span>
                    </label>

                    {EVENTI.map(ev => {
                      const on = ev.key in eventi
                      return (
                        <div key={ev.key} className={`pl-card pl-card-ev ${on ? 'on' : ''}`}>
                          <label className="pl-card-main">
                            <input type="checkbox" checked={on} onChange={() => toggleEvento(ev.key)} />
                            <span className="pl-card-box" aria-hidden="true" />
                            <span className="pl-card-txt">
                              <b>{ev.nome}</b>
                              <small>{ev.quando}</small>
                              <em>{ev.desc}</em>
                            </span>
                          </label>
                          {on && (
                            <div className="pl-persone">
                              <span>In quanti venite?</span>
                              <div className="pl-stepper">
                                <button type="button" aria-label="Una persona in meno" disabled={eventi[ev.key] <= 1} onClick={() => cambiaPersone(ev.key, -1)}>−</button>
                                <output>{eventi[ev.key]}</output>
                                <button type="button" aria-label="Una persona in più" disabled={eventi[ev.key] >= MAX_PERSONE} onClick={() => cambiaPersone(ev.key, +1)}>+</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </fieldset>

                {/* ---- passo 2: quando nuoti (solo se nuota) ---- */}
                {nuota && (
                  <fieldset>
                    <legend><span className="pl-num">2</span>Quando vuoi nuotare?</legend>
                    <p className="pl-hint">Ogni riga è un'ora, ogni casella un turno da 10 minuti. Toccane quanti ne vuoi: per mezz'ora, tre di seguito.</p>

                    {turniError ? (
                      <div className="pl-turni-msg">
                        Non riesco a caricare i turni.{' '}
                        <button type="button" className="pl-link" onClick={caricaTurni}>Riprova</button>
                      </div>
                    ) : turni === null ? (
                      <div className="pl-turni-msg">Carico i turni disponibili…</div>
                    ) : (
                      <>
                        <div className="pl-tabs" role="tablist">
                          {[12, 13].map(d => (
                            <button key={d} type="button" role="tab" aria-selected={giorno === d}
                                    className={giorno === d ? 'on' : ''} onClick={() => setGiorno(d)}>
                              {d === 12 ? 'Sabato 12' : 'Domenica 13'}
                              <small>{liberiPerGiorno[d]} turni liberi</small>
                            </button>
                          ))}
                        </div>

                        {liberiPerGiorno[giorno] === 0 && (
                          <div className="pl-turni-msg">
                            {liberiPerGiorno[12] + liberiPerGiorno[13] === 0
                              ? 'Al momento non ci sono turni liberi. Manda lo stesso la richiesta: ti avvisiamo se si libera qualcosa.'
                              : `${giorno === 12 ? 'Sabato' : 'Domenica'} è pieno: prova l'altro giorno.`}
                          </div>
                        )}
                        <div className="pl-ore">
                          {gruppi.map(g => (
                            <div key={g.h} className="pl-ora">
                              <p className="pl-ora-tit">
                                {g.ora}
                                {g.notturna && <span className="pl-notte"> · notte</span>}
                              </p>
                              <div className="pl-chips">
                                {g.turni.map(t => (
                                  <label key={t.slot_id} className={`pl-chip ${scelti.includes(t.slot_id) ? 'on' : ''} ${t.occupato ? 'full' : ''}`}>
                                    <input type="checkbox" disabled={t.occupato} checked={scelti.includes(t.slot_id)} onChange={() => toggleTurno(t.slot_id)} />
                                    <span>{t.ora}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="pl-legenda"><i className="lib" /> libero <i className="sel" /> scelto <i className="occ" /> già preso</p>
                      </>
                    )}

                    <p className={`pl-counter ${scelti.length === 0 ? 'muted' : ''}`}>
                      {scelti.length === 0
                        ? 'Nessun turno scelto'
                        : `${scelti.length} ${scelti.length === 1 ? 'turno' : 'turni'} · ${scelti.length * 10} minuti in acqua`}
                    </p>
                    <p className="pl-note">I turni che scegli sono una preferenza: te li confermiamo noi.</p>
                  </fieldset>
                )}

                {/* ---- passo 3: i tuoi dati ---- */}
                <fieldset>
                  <legend><span className="pl-num">{nStepDati}</span>I tuoi dati</legend>

                  <label htmlFor="pl-nome">Nome e cognome</label>
                  <input id="pl-nome" type="text" autoComplete="name" placeholder="Es. Maria Rossi"
                         value={nome} onChange={e => setNome(e.target.value)} />

                  <label htmlFor="pl-tel">Numero di telefono</label>
                  <input id="pl-tel" type="tel" autoComplete="tel" inputMode="tel" placeholder="Ti scriviamo qui per confermare"
                         value={telefono} onChange={e => setTelefono(e.target.value)} />

                  <label htmlFor="pl-mail">Email <span className="pl-opt">facoltativa</span></label>
                  <input id="pl-mail" type="email" autoComplete="email" inputMode="email" placeholder="Per ricevere gli aggiornamenti"
                         value={email} onChange={e => setEmail(e.target.value)} />

                  {/* honeypot: invisibile agli umani, i bot lo riempiono */}
                  <div className="pl-esca" aria-hidden="true">
                    <label htmlFor="pl-azienda">Azienda</label>
                    <input id="pl-azienda" type="text" tabIndex={-1} autoComplete="off"
                           value={esca} onChange={e => setEsca(e.target.value)} />
                  </div>

                  <label className="pl-check">
                    <input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} />
                    <span>
                      Acconsento al trattamento dei miei dati secondo l'
                      {/* TODO: sostituire con il link all'informativa quando il testo sarà disponibile */}
                      <a href="#privacy" onClick={e => { e.preventDefault(); alert('Informativa privacy in preparazione: sarà pubblicata prima dell\'evento.') }}>informativa privacy</a>
                    </span>
                  </label>

                  <label className="pl-check">
                    <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} />
                    <span>Tenetemi aggiornato sui prossimi eventi di Passa l'Acqua</span>
                  </label>
                </fieldset>

                {/* ---- riepilogo + invio ---- */}
                <div className="pl-riepilogo">
                  <p className="pl-riepilogo-tit">La tua richiesta</p>
                  {riepilogo.length === 0 ? (
                    <p className="pl-riepilogo-vuoto">Non hai ancora scelto niente: torna al passo 1.</p>
                  ) : (
                    <ul>
                      {riepilogo.map(r => (
                        <li key={r.k} className={r.warn ? 'warn' : ''}>
                          <strong>{r.txt}</strong><small>{r.sub}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button type="submit" disabled={invio}>{invio ? 'Un attimo…' : 'Invia la richiesta'}</button>
                {errore && <p className="pl-err" role="alert">{errore}</p>}
                <p className="pl-fine">Ti rispondiamo noi su WhatsApp. Non è ancora una conferma.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="pl-wrap pl-footer">
        <p>
          Passa l'Acqua — Piscina dell'ASC Hotel, via di Castelsecco 8/h, Arezzo<br />
          Raccolta divisa fra Calcit e AllStars Special Olympics · Sponsor principale: Lapi Chimici · #passalacqua
        </p>
      </footer>
    </div>
  )
}

// CSS della sola pagina evento: prefisso pl- per non toccare il resto
// dell'app. Serve un foglio vero (non stili inline) per :focus-within,
// hover e media query.
const CSS = `
.pl{--aqua:#17A2A0;--aqua-dark:#0E7A78;--aqua-pale:#E8F6F5;--ink:#12100F;--mute:#5B5754;--line:#D9D5D1;
  background:#fff;color:var(--ink);font-family:'Oswald',sans-serif;font-weight:300;
  min-height:100vh;line-height:1.55;}
.pl *{box-sizing:border-box;}
.pl-wrap{max-width:640px;margin:0 auto;padding:0 20px;}
.pl h1,.pl h2,.pl legend,.pl .pl-cta,.pl button[type=submit]{font-family:'Anton',sans-serif;font-weight:400;}
.pl h1{font-size:clamp(56px,16vw,104px);line-height:.92;letter-spacing:-.5px;margin:6px 0 10px;text-transform:uppercase;}
.pl h2{font-size:clamp(24px,6vw,32px);line-height:1.1;margin:0 0 14px;text-transform:uppercase;}
.pl p{margin:0 0 12px;}
.pl-hero{padding:44px 20px 30px;}
.pl-eyebrow{font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:var(--aqua-dark);font-weight:500;margin:0;}
.pl-sub{font-size:19px;font-weight:400;margin:0 0 2px;}
.pl-payoff{font-size:16px;color:var(--aqua-dark);font-weight:400;font-style:italic;margin:0;}
.pl-cta-wrap{margin:24px 0 0;}
.pl-cta{display:inline-block;background:var(--aqua);color:#fff;text-decoration:none;
  padding:15px 34px;border-radius:999px;font-size:19px;letter-spacing:.5px;text-transform:uppercase;}
.pl-cta:hover{background:var(--aqua-dark);}
.pl-cta-note{font-size:13.5px;color:var(--mute);margin:9px 0 0;}
/* solo verticale, coi longhand: il padding LATERALE arriva da .pl-wrap */
.pl section{padding-top:30px;padding-bottom:30px;}

/* come funziona */
.pl-mosse{list-style:none;margin:0 0 18px;padding:0;}
.pl-mosse li{display:flex;gap:14px;align-items:flex-start;padding:10px 0;font-size:15.5px;}
.pl-mosse li b{flex:none;width:34px;height:34px;border-radius:50%;background:var(--aqua);color:#fff;
  font-family:'Anton',sans-serif;font-weight:400;font-size:18px;display:flex;align-items:center;justify-content:center;}
.pl-mosse strong{font-weight:500;}
.pl-causa{background:var(--aqua-pale);border-radius:14px;padding:16px 18px;font-size:15px;}
.pl-causa p{margin:0;}
.pl-causa strong{font-weight:500;}
.pl-causa b{font-weight:500;color:var(--aqua-dark);}

/* form: full-bleed di proposito (fondo acqua) */
.pl-formsec{background:var(--aqua-pale);padding-top:30px;padding-bottom:44px;}
.pl-formcard{background:#fff;border-radius:18px;padding:24px 20px;}
.pl fieldset{border:none;padding:0;margin:0 0 30px;}
.pl legend{font-size:22px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:10px;}
.pl-num{flex:none;width:30px;height:30px;border-radius:50%;background:var(--ink);color:#fff;font-size:17px;
  display:inline-flex;align-items:center;justify-content:center;}
.pl-hint{font-size:14px;color:var(--mute);margin:0 0 12px;}
.pl label{display:block;font-size:14.5px;font-weight:400;margin:14px 0 6px;}
.pl-opt{color:var(--mute);font-weight:300;font-size:13px;}
.pl input[type=text],.pl input[type=tel],.pl input[type=email]{
  width:100%;padding:14px;border:1.5px solid var(--line);border-radius:10px;
  font-family:'Oswald',sans-serif;font-size:17px;font-weight:300;background:#fff;color:var(--ink);}
.pl input:focus{outline:none;border-color:var(--aqua);box-shadow:0 0 0 3px rgba(23,162,160,.18);}

/* card di scelta (passo 1) — ".pl .pl-…" per battere ".pl label" */
.pl-cards{display:flex;flex-direction:column;gap:10px;}
.pl .pl-card{margin:0;border:1.5px solid var(--line);border-radius:14px;padding:14px;cursor:pointer;transition:border-color .12s,background .12s;}
.pl .pl-card.on{border-color:var(--aqua);background:var(--aqua-pale);}
.pl .pl-card,.pl .pl-card-main{display:flex;gap:12px;align-items:flex-start;}
.pl .pl-card-main{margin:0;cursor:pointer;}
.pl-card input{position:absolute;opacity:0;width:0;height:0;}
.pl-card-box{flex:none;width:26px;height:26px;border:2px solid var(--line);border-radius:8px;margin-top:1px;background:#fff;position:relative;}
.pl-card.on .pl-card-box{background:var(--aqua);border-color:var(--aqua);}
.pl-card.on .pl-card-box::after{content:'';position:absolute;left:8px;top:3px;width:6px;height:12px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg);}
.pl-card:focus-within .pl-card-box{outline:3px solid rgba(23,162,160,.45);outline-offset:2px;}
.pl-card-txt{display:block;line-height:1.35;}
.pl-card-txt b{display:block;font-weight:500;font-size:17px;}
.pl-card-txt small{display:block;color:var(--aqua-dark);font-weight:500;font-size:14px;margin-top:2px;}
.pl-card-txt em{display:block;color:var(--mute);font-style:normal;font-size:13.5px;margin-top:2px;}
/* stepper persone dentro la card: un div, non parte della label */
.pl .pl-card-ev{flex-direction:column;gap:0;}
.pl .pl-card-ev > .pl-card-main{width:100%;}
.pl-persone{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 0 38px;font-size:14.5px;}
.pl-stepper{display:inline-flex;align-items:center;border:1.5px solid var(--aqua);border-radius:999px;background:#fff;overflow:hidden;}
.pl-stepper button{width:42px;height:38px;border:none;background:none;font-size:22px;color:var(--aqua-dark);cursor:pointer;font-family:inherit;}
.pl-stepper button:disabled{color:#C9C5C1;cursor:default;}
.pl-stepper output{display:inline-block;min-width:34px;text-align:center;font-weight:500;font-size:17px;}

/* selettore turni (passo 2) */
.pl-tabs{display:flex;gap:8px;margin:4px 0 12px;}
.pl-tabs button{flex:1;padding:10px 8px;border:1.5px solid var(--line);border-radius:12px;background:#fff;
  font-family:'Oswald',sans-serif;font-weight:500;font-size:15.5px;color:var(--ink);cursor:pointer;line-height:1.2;}
.pl-tabs button small{display:block;font-weight:300;font-size:12.5px;color:var(--mute);margin-top:2px;}
.pl-tabs button.on{border-color:var(--aqua);background:var(--aqua);color:#fff;}
.pl-tabs button.on small{color:rgba(255,255,255,.85);}
.pl-ore{max-height:400px;overflow-y:auto;border:1.5px solid #E7E4E1;border-radius:12px;padding:10px;}
.pl-ora{margin-bottom:10px;}
.pl-ora:last-child{margin-bottom:0;}
.pl-ora-tit{font-size:13px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;color:var(--aqua-dark);margin:0 0 4px;}
.pl-notte{color:var(--mute);font-weight:300;text-transform:none;letter-spacing:0;}
/* una riga per ora: sei chip da 10' sempre nella stessa colonna */
.pl-chips{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:4px 0 2px;}
.pl .pl-chip{display:block;margin:0;cursor:pointer;min-width:0;}
.pl-chip input{position:absolute;opacity:0;width:0;height:0;}
.pl-chip span{display:block;text-align:center;padding:10px 0;border:1.5px solid var(--line);border-radius:10px;
  font-size:13.5px;font-weight:400;background:#fff;transition:all .12s;font-variant-numeric:tabular-nums;}
.pl-chip.on span{background:var(--aqua);border-color:var(--aqua);color:#fff;}
.pl-chip:hover span{border-color:var(--aqua);}
.pl-chip.full{cursor:default;}
.pl-chip.full span{background:#F1EFEC;border-color:#F1EFEC;color:#B5B0AB;text-decoration:line-through;}
.pl-chip.full:hover span{border-color:#F1EFEC;}
.pl-chip:focus-within span{outline:3px solid rgba(23,162,160,.45);outline-offset:2px;}
.pl-legenda{display:flex;gap:14px;align-items:center;font-size:12.5px;color:var(--mute);margin:8px 0 0;}
.pl-legenda i{display:inline-block;width:14px;height:14px;border-radius:4px;margin-right:5px;vertical-align:-2px;border:1.5px solid var(--line);background:#fff;}
.pl-legenda i.sel{background:var(--aqua);border-color:var(--aqua);}
.pl-legenda i.occ{background:#F1EFEC;border-color:#F1EFEC;}
.pl-counter{font-size:15px;font-weight:500;color:var(--aqua-dark);margin:12px 0 8px;}
.pl-counter.muted{color:var(--mute);font-weight:300;}
.pl-note{font-size:13.5px;color:#4A4644;background:#F7F6F4;border-radius:10px;padding:10px 14px;margin:0;}
.pl-turni-msg{font-size:14.5px;color:var(--mute);padding:14px 0;}

/* consensi */
.pl .pl-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0 0;font-size:14.5px;cursor:pointer;}
.pl-check input{width:22px;height:22px;flex:none;margin-top:2px;accent-color:var(--aqua);}
.pl-check span{font-weight:300;}
.pl-check a{color:var(--aqua-dark);}

/* riepilogo + invio */
.pl-riepilogo{border:2px solid var(--aqua);border-radius:14px;padding:14px 16px;margin-bottom:4px;}
.pl-riepilogo-tit{font-size:12.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--aqua-dark);font-weight:500;margin:0 0 6px;}
.pl-riepilogo ul,.pl-done-list{list-style:none;margin:0;padding:0;}
.pl-riepilogo li,.pl-done-list li{padding:6px 0;border-top:1px solid #E7E4E1;}
.pl-riepilogo li:first-child,.pl-done-list li:first-child{border-top:none;}
.pl-riepilogo strong,.pl-done-list strong{display:block;font-weight:500;font-size:15.5px;}
.pl-riepilogo small,.pl-done-list small{display:block;color:var(--mute);font-size:13.5px;}
.pl-riepilogo li.warn small{color:#B3261E;}
.pl-riepilogo-vuoto{font-size:14.5px;color:var(--mute);margin:0;}
.pl button[type=submit]{width:100%;margin-top:14px;background:var(--aqua);color:#fff;border:none;
  border-radius:999px;padding:18px 20px;font-size:21px;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;}
.pl button[type=submit]:hover:not(:disabled){background:var(--aqua-dark);}
.pl button[type=submit]:disabled{opacity:.6;cursor:default;}
.pl-link{background:none;border:none;color:var(--aqua-dark);font-family:inherit;font-size:inherit;
  text-decoration:underline;cursor:pointer;padding:0;}
.pl-err{color:#B3261E;font-size:15px;margin:12px 0 0;font-weight:400;}
.pl-fine{font-size:13px;color:var(--mute);text-align:center;margin:10px 0 0;}
.pl-done{text-align:center;padding:16px 0;}
.pl-done h2{color:var(--aqua-dark);}
.pl-done-list{text-align:left;max-width:360px;margin:0 auto 16px;}
.pl-esca{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
.pl-footer{padding:24px 20px 40px;font-size:13px;color:var(--mute);text-align:center;}
@media(prefers-reduced-motion:reduce){.pl *{transition:none!important;}}
`
