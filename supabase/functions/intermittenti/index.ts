// ============================================================
// Edge Function: intermittenti
// Comunicazioni obbligatorie per i lavoratori a chiamata (modulo
// ministeriale UNI-Intermittenti ML-15-01).
//
// Azioni (solo admin autenticato):
//   anteprima : cosa c'e' da comunicare / annullare (nessun effetto)
//   invia     : compila il modulo PDF ministeriale e lo spedisce in
//               allegato via email, poi registra (nel registro resta
//               anche l'XML equivalente dei dati inviati).
//               Richiede l'impronta dell'anteprima confermata: se nel
//               frattempo i turni sono cambiati NON invia.
//   notifica  : avviso Telegram se ci sono comunicazioni in attesa
//               (una sola volta per ogni stato diverso)
//
// Secret della function (supabase secrets set ...):
//   SMTP_USER, SMTP_PASS            credenziali SMTP (password per le app)
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465)
//   INTERMITTENTI_MITTENTE          default amministrazione@aschotel.com
//   INTERMITTENTI_PROVA             default attiva. Solo con il valore
//                                   "false" l'email va al Ministero;
//                                   altrimenti va SOLO al mittente e
//                                   nulla viene segnato come comunicato.
//   TELEGRAM_BOT_TOKEN              (gia' usato da notify-order)
//   TELEGRAM_CHAT_ID_INTERMITTENTI  chat che riceve gli avvisi
//
// Deploy:  supabase functions deploy intermittenti
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import * as PDFLib from 'npm:pdf-lib@1.17.1'
import { compilaPdf } from '../_shared/intermittenti_pdf.ts'
import { modelloPdf } from '../_shared/modulo_intermittenti.ts'
import {
  aBlocchi, calcolaPiano, dataModulo, generaXml, improntaPiano,
  Lavoratore, Piano, RigaAttiva, RigaDaAnnullare,
} from '../_shared/intermittenti.ts'

const DESTINATARIO_MINISTERO = 'intermittenti@pec.lavoro.gov.it'
const OGGETTO = 'Invio telematico Modulo Intermittenti'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Data di oggi in Italia, 'YYYY-MM-DD'.
function oggiRoma(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
}

function inProva(): boolean {
  return (Deno.env.get('INTERMITTENTI_PROVA') ?? '').trim().toLowerCase() !== 'false'
}

function mittente(): string {
  return Deno.env.get('INTERMITTENTI_MITTENTE') || 'amministrazione@aschotel.com'
}

async function caricaPiano(db: SupabaseClient): Promise<{ piano: Piano; righeAttive: RigaAttiva[]; oggi: string }> {
  const oggi = oggiRoma()

  const { data: dips, error: e1 } = await db.from('dipendenti')
    .select('id,nome,cognome,codice_fiscale,codice_comunicazione,a_chiamata_dal')
    .eq('a_chiamata', true)
  if (e1) throw new Error(e1.message)
  const lavoratori: Lavoratore[] = (dips || []).map(d => ({
    id: d.id,
    nome: [d.nome, d.cognome].filter(Boolean).join(' '),
    codice_fiscale: d.codice_fiscale,
    codice_comunicazione: d.codice_comunicazione,
    a_chiamata_dal: d.a_chiamata_dal,
  }))
  if (lavoratori.length === 0) return { piano: { comunicazioni: [], annullamenti: [] }, righeAttive: [], oggi }
  const ids = lavoratori.map(l => l.id)

  const { data: righe, error: e2 } = await db.from('intermittenti_righe')
    .select('id,dipendente_id,data_inizio,data_fine')
    .eq('stato', 'comunicato').in('dipendente_id', ids).gte('data_fine', oggi)
  if (e2) throw new Error(e2.message)
  const righeAttive = (righe || []) as RigaAttiva[]

  // I turni servono da oggi, oppure dall'inizio della riga attiva piu' vecchia.
  const dal = righeAttive.reduce((m, r) => (r.data_inizio < m ? r.data_inizio : m), oggi)
  const giorni: Record<string, string[]> = {}
  for (let da = 0; ; da += 1000) {
    const { data: turni, error: e3 } = await db.from('shifts')
      .select('dipendente_id,data').in('dipendente_id', ids).gte('data', dal)
      .order('data').order('id').range(da, da + 999)
    if (e3) throw new Error(e3.message)
    for (const t of turni || []) (giorni[t.dipendente_id] ||= []).push(t.data)
    if (!turni || turni.length < 1000) break
  }

  return { piano: calcolaPiano(lavoratori, giorni, righeAttive, oggi), righeAttive, oggi }
}

async function spedisci(pdf: Uint8Array, prova: boolean): Promise<string> {
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!user || !pass) throw new Error('SMTP_USER / SMTP_PASS non configurati')
  const port = Number(Deno.env.get('SMTP_PORT') || 465)
  const transporter = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  const from = mittente()
  const to = prova ? from : DESTINATARIO_MINISTERO
  await transporter.sendMail({
    from,
    to,
    bcc: prova ? undefined : from,
    subject: prova ? `[PROVA] ${OGGETTO}` : OGGETTO,
    text: OGGETTO,
    attachments: [{ filename: 'UNI_Intermittenti.pdf', content: pdf, contentType: 'application/pdf' }],
  })
  return to
}

function testoTelegram(p: Piano): string {
  const l: string[] = ['COMUNICAZIONI INTERMITTENTI DA INVIARE', '']
  if (p.comunicazioni.some(r => r.urgente)) l.push('ATTENZIONE: ci sono turni che iniziano entro domani.', '')
  if (p.comunicazioni.length) {
    l.push('Da comunicare:')
    for (const r of p.comunicazioni) {
      const date = r.data_inizio === r.data_fine ? dataModulo(r.data_inizio) : `${dataModulo(r.data_inizio)} - ${dataModulo(r.data_fine)}`
      l.push(`- ${r.nome}: ${date}${r.urgente ? ' (urgente)' : ''}`)
    }
  }
  if (p.annullamenti.length) {
    if (p.comunicazioni.length) l.push('')
    l.push('Da annullare:')
    for (const r of p.annullamenti) {
      const date = r.data_inizio === r.data_fine ? dataModulo(r.data_inizio) : `${dataModulo(r.data_inizio)} - ${dataModulo(r.data_fine)}`
      l.push(`- ${r.nome}: ${date}`)
    }
  }
  l.push('', 'Conferma e invia da: https://co.aschotel.com/admin/turni')
  return l.join('\n')
}

async function notifica(db: SupabaseClient, piano: Piano): Promise<string> {
  const impronta = improntaPiano(piano)
  const { data: stato } = await db.from('intermittenti_stato').select('impronta_notificata').eq('id', 1).maybeSingle()
  if ((stato?.impronta_notificata ?? '') === impronta) return 'gia-notificato'
  if (impronta !== '') {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chat = Deno.env.get('TELEGRAM_CHAT_ID_INTERMITTENTI')
    if (!token || !chat) return 'telegram-non-configurato'
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: testoTelegram(piano), disable_web_page_preview: true }),
    })
    if (!res.ok) { console.error('intermittenti: Telegram', res.status, await res.text()); return 'telegram-errore' }
  }
  await db.from('intermittenti_stato')
    .upsert({ id: 1, impronta_notificata: impronta, notificata_at: new Date().toISOString() })
  return impronta === '' ? 'niente-in-attesa' : 'notificato'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Autenticazione mancante' })
    const caller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessione non valida' })

    const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return json({ error: 'Operazione riservata agli admin' })

    const body = await req.json().catch(() => ({}))
    const { piano, righeAttive, oggi } = await caricaPiano(db)
    const impronta = improntaPiano(piano)
    const prova = inProva()

    if (body.action === 'anteprima') {
      return json({ piano, righeAttive, impronta, oggi, prova, mittente: mittente() })
    }

    if (body.action === 'notifica') {
      return json({ esito: await notifica(db, piano) })
    }

    if (body.action === 'invia') {
      if (impronta === '') return json({ error: 'Non c\'e\' niente da inviare' })
      if (body.impronta !== impronta) {
        return json({ error: 'I turni sono cambiati dopo l\'apertura del riepilogo: ricontrolla e conferma di nuovo.' })
      }

      const esiti: { tipo: string; righe: number; esito: string; errore?: string }[] = []
      // Prima gli annullamenti: se uno fallisce non si ricomunica nulla,
      // per non avere due comunicazioni valide sugli stessi giorni.
      const lotti = [
        ...aBlocchi(piano.annullamenti).map(r => ({ tipo: 'annullamento' as const, righe: r })),
        ...aBlocchi(piano.comunicazioni).map(r => ({ tipo: 'comunicazione' as const, righe: r })),
      ]
      for (const lotto of lotti) {
        const opts = { emailDatore: mittente(), annullamento: lotto.tipo === 'annullamento' }
        const xml = generaXml(lotto.righe, opts)
        let errore: string | null = null
        let destinatario = prova ? mittente() : DESTINATARIO_MINISTERO
        try {
          const pdf = await compilaPdf(PDFLib, modelloPdf(), lotto.righe, opts)
          destinatario = await spedisci(pdf, prova)
        } catch (e) { errore = (e as Error).message }

        const { data: invio, error: insErr } = await db.from('intermittenti_invii').insert({
          admin_id: user.id,
          admin_email: user.email,
          tipo: lotto.tipo,
          righe: lotto.righe.map(r => ({
            nome: r.nome, codice_fiscale: r.codice_fiscale, codice_comunicazione: r.codice_comunicazione,
            data_inizio: r.data_inizio, data_fine: r.data_fine,
          })),
          xml, destinatario, prova,
          esito: errore ? 'errore' : 'ok',
          errore,
        }).select('id').single()

        if (errore) {
          esiti.push({ tipo: lotto.tipo, righe: lotto.righe.length, esito: 'errore', errore })
          return json({ error: `Invio non riuscito: ${errore}`, esiti, prova })
        }
        // Email partita ma registro non scritto: fermarsi e dirlo chiaramente.
        if (insErr || !invio) {
          return json({ error: `Email inviata a ${destinatario} ma NON registrata (${insErr?.message}). Non ripetere l'invio: controlla la posta inviata.`, esiti, prova })
        }

        if (!prova) {
          const { error: updErr } = lotto.tipo === 'annullamento'
            ? await db.from('intermittenti_righe')
                .update({ stato: 'annullato', annullamento_invio_id: invio.id })
                .in('id', (lotto.righe as RigaDaAnnullare[]).map(r => r.id))
            : await db.from('intermittenti_righe').insert(lotto.righe.map(r => ({
                dipendente_id: (r as { dipendente_id: string }).dipendente_id,
                data_inizio: r.data_inizio, data_fine: r.data_fine, invio_id: invio.id,
              })))
          if (updErr) {
            return json({ error: `Email inviata a ${destinatario} ma stato non aggiornato (${updErr.message}). Non ripetere l'invio: controlla il registro.`, esiti, prova })
          }
        }
        esiti.push({ tipo: lotto.tipo, righe: lotto.righe.length, esito: 'ok' })
      }

      if (!prova) {
        await db.from('intermittenti_stato')
          .upsert({ id: 1, impronta_notificata: '', notificata_at: new Date().toISOString() })
      }
      return json({ ok: true, esiti, prova })
    }

    return json({ error: 'Azione non riconosciuta' })
  } catch (e) {
    console.error('intermittenti:', e)
    return json({ error: (e as Error).message || 'Errore interno' })
  }
})
