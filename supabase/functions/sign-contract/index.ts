// ============================================================
// Edge Function: sign-contract
// Esegue ATOMICAMENTE la firma del contratto di membership:
//   1. Identifica il chiamante (guest)
//   2. Valida i 5 campi anagrafici
//   3. Carica il body del contratto da DB
//   4. UPDATE su members (intestatario) coi dati anagrafici
//   5. Genera PDF con pdf-lib, sostituendo i placeholder
//   6. Upload del PDF su Storage (contract-signatures/sig/<uid>/<sigid>.pdf)
//   7. INSERT in contract_signatures (id, user_id, signed_at, ip, ua, pdf_path)
//
// Se uno step dopo il 5 fallisce, fa best-effort cleanup del PDF
// orfano. Ritorna sempre JSON con stato chiaro.
//
// Deploy:  supabase functions deploy sign-contract
// Consigliato: verify_jwt = ON (chiamato da utente loggato).
// Secret: nessuno (SUPABASE_URL / *_KEY iniettate automaticamente).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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

// Validazione minima CF: 16 caratteri formato italiano. Se non matcha
// accettiamo comunque CF "stranieri/temporanei" (almeno 4 char non vuoti):
// la regola legale precisa la fa il legale, qui evitiamo solo input ovviamente
// vuoti/manomessi.
const CF_REGEX = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/
function validCFLoose(cf: string): boolean {
  const upper = cf.trim().toUpperCase()
  if (CF_REGEX.test(upper)) return true
  return upper.length >= 4
}

// Sostituisce i placeholder {{NOME}} con i valori reali.
function substitute(body: string, vars: Record<string, string>): string {
  let out = body
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}

// YYYY-MM-DD -> GG/MM/AAAA
function fmtDateIT(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Date -> "25/05/2026 10:30" in fuso Europe/Rome
function fmtSignedAtIT(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!

    // --- 1. Identifica chiamante ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Autenticazione mancante' })

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessione non valida' })

    // --- 2. Valida input ---
    const body = await req.json().catch(() => ({}))
    const {
      luogo_nascita,
      data_nascita,
      residenza,
      codice_fiscale,
      numero_documento,
    } = body ?? {}

    const required: Record<string, unknown> = {
      luogo_nascita, data_nascita, residenza, codice_fiscale, numero_documento,
    }
    for (const [k, v] of Object.entries(required)) {
      if (typeof v !== 'string' || !v.trim()) {
        return json({ error: `Campo obbligatorio mancante o vuoto: ${k}` })
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_nascita)) {
      return json({ error: 'Data di nascita non valida (atteso YYYY-MM-DD)' })
    }
    if (!validCFLoose(codice_fiscale)) {
      return json({ error: 'Codice fiscale non valido' })
    }

    // --- 3. Service-role client per operazioni ---
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // --- 4a. Fetch account intestatario ---
    const { data: account, error: accErr } = await admin
      .from('accounts')
      .select('id, name, surname')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (accErr) {
      console.error('sign-contract: select accounts', accErr.message)
      return json({ error: 'Errore lettura account: ' + accErr.message })
    }
    if (!account) return json({ error: 'Account non trovato per questo utente' })

    // --- 4b. Fetch member intestatario (head): identificato come il
    // membro PIU' VECCHIO dell'account (ORDER BY created_at ASC LIMIT 1).
    //
    // Perche' funziona: in NuovoOspite il "membro principale" e' sempre
    // il primo INSERT su members per quell'account; i familiari vengono
    // aggiunti dopo (loop sequenziale + aggiungiMembro in SchedaOspite),
    // quindi created_at del head e' strettamente < quello dei familiari.
    //
    // Niente match per name+surname (fragile: si rompe se l'admin rinomina
    // l'account senza allineare members.name, o con familiari omonimi).
    const { data: member, error: memErr } = await admin
      .from('members')
      .select('id')
      .eq('account_id', account.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (memErr) {
      console.error('sign-contract: select member', memErr.message)
      return json({ error: 'Errore lettura membro: ' + memErr.message })
    }
    if (!member) return json({ error: 'Membro intestatario non trovato per questo account' })

    // --- 4c. Fetch contratto ---
    const { data: contract, error: contractErr } = await admin
      .from('contracts')
      .select('title, body')
      .limit(1)
      .maybeSingle()
    if (contractErr) {
      console.error('sign-contract: select contract', contractErr.message)
      return json({ error: 'Errore lettura contratto: ' + contractErr.message })
    }
    if (!contract) return json({ error: 'Contratto non disponibile' })

    // --- 5. UPDATE member coi dati anagrafici (idempotente) ---
    const cfUpper = codice_fiscale.trim().toUpperCase()
    const { error: updErr } = await admin.from('members').update({
      luogo_nascita_testo: luogo_nascita.trim(),
      data_nascita: data_nascita,
      residenza: residenza.trim(),
      codice_fiscale: cfUpper,
      numero_documento: numero_documento.trim(),
    }).eq('id', member.id)
    if (updErr) {
      console.error('sign-contract: update members', updErr.message)
      return json({ error: 'Impossibile salvare i dati anagrafici: ' + updErr.message })
    }

    // --- 6. Sostituisci placeholder e genera PDF ---
    const now = new Date()
    const nomeCognome = `${account.name} ${account.surname}`.trim()
    const filledBody = substitute(contract.body, {
      NOME_COGNOME:     nomeCognome,
      LUOGO_NASCITA:    luogo_nascita.trim(),
      DATA_NASCITA:     fmtDateIT(data_nascita),
      RESIDENZA:        residenza.trim(),
      CODICE_FISCALE:   cfUpper,
      NUMERO_DOCUMENTO: numero_documento.trim(),
      DATA_FIRMA:       fmtSignedAtIT(now),
    })

    let pdfBytes: Uint8Array
    try {
      pdfBytes = await generatePDF({ title: contract.title, body: filledBody })
    } catch (e) {
      console.error('sign-contract: pdf generation', e instanceof Error ? e.message : String(e))
      return json({ error: 'Errore generazione PDF: ' + (e instanceof Error ? e.message : String(e)) })
    }

    // --- 7. Upload PDF a Storage ---
    const signatureId = crypto.randomUUID()
    const pdfPath = `sig/${user.id}/${signatureId}.pdf`
    const { error: uplErr } = await admin.storage
      .from('contract-signatures')
      .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })
    if (uplErr) {
      console.error('sign-contract: upload', uplErr.message)
      return json({ error: 'Impossibile caricare il PDF: ' + uplErr.message })
    }

    // --- 8. INSERT firma ---
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const ua = req.headers.get('user-agent') || null
    const { data: sigRow, error: insErr } = await admin
      .from('contract_signatures')
      .insert({
        id: signatureId,
        user_id: user.id,
        signed_at: now.toISOString(),
        ip,
        user_agent: ua,
        pdf_path: pdfPath,
      })
      .select('id, signed_at')
      .single()
    if (insErr) {
      console.error('sign-contract: insert signature', insErr.message)
      // Cleanup orphan PDF best-effort.
      try {
        await admin.storage.from('contract-signatures').remove([pdfPath])
      } catch (cleanupErr) {
        console.error('sign-contract: cleanup orphan PDF failed', cleanupErr)
      }
      return json({ error: 'Impossibile registrare la firma: ' + insErr.message })
    }

    return json({
      ok: true,
      signature_id: sigRow.id,
      signed_at: sigRow.signed_at,
      pdf_path: pdfPath,
    })
  } catch (e) {
    console.error('sign-contract: exception', e instanceof Error ? e.message : String(e))
    return json({ error: 'Errore interno: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})


// ============================================================
// Generazione PDF
// ============================================================
// A4 portrait, font Helvetica built-in (no font esterno),
// titoli Art./Tra/e/premesso/si conviene in bold + spaziatura.
// Multi-pagina con wrap automatico.
// NB: Helvetica supporta WinAnsi (Latin-1 + tipografia standard):
// va bene per accentate IT e caratteri come — " " ' € usati nel body.
async function generatePDF({ title, body }: { title: string; body: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 595, pageHeight = 842 // A4 in punti
  const margin = 50
  const maxWidth = pageWidth - 2 * margin
  const lineHeight = 12
  const fontSize = 10
  const titleSize = 14
  const artSize = 11
  const black = rgb(0, 0, 0)

  let page = pdf.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight])
    cursorY = pageHeight - margin
  }
  function checkPage(needed: number) {
    if (cursorY - needed < margin) newPage()
  }
  function drawLine(text: string, useFont = font, size = fontSize) {
    checkPage(lineHeight)
    page.drawText(text, { x: margin, y: cursorY, font: useFont, size, color: black })
    cursorY -= lineHeight
  }
  function wrapAndDraw(text: string, useFont = font, size = fontSize) {
    if (text === '') { checkPage(lineHeight); cursorY -= lineHeight; return }
    const words = text.split(' ')
    let line = ''
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      const width = useFont.widthOfTextAtSize(test, size)
      if (width > maxWidth && line) {
        drawLine(line, useFont, size)
        line = w
      } else {
        line = test
      }
    }
    if (line) drawLine(line, useFont, size)
  }

  // Titolo del documento (sopra al body)
  drawLine(title, fontBold, titleSize)
  cursorY -= 8

  // Body: linea per linea. Le righe che sono "titoli strutturali"
  // (Art./Art. 1-bis/Tra/e/premesso/si conviene) vanno in bold con
  // spaziatura extra sopra/sotto.
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\s+$/u, '')
    if (line === '') {
      cursorY -= lineHeight * 0.5
      continue
    }
    const isHeader =
      /^Art\.\s/.test(line) ||
      /^premesso$/i.test(line) ||
      /^Tra$/i.test(line) ||
      /^e$/i.test(line) ||
      /^si conviene/i.test(line)
    if (isHeader) {
      cursorY -= lineHeight * 0.3
      wrapAndDraw(line, fontBold, artSize)
      cursorY -= lineHeight * 0.2
    } else {
      wrapAndDraw(line)
    }
  }

  return await pdf.save()
}
