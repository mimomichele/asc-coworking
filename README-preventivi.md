# Preventivi (admin)

Sezione admin per gestire le richieste di preventivo (raduni / gruppi
scolastici / famiglie). Entra da **/admin/preventivi**.

Il badge rosso in topbar conta le richieste in stato *Ricevuta*. La
tab **Oggi** mostra Nuove da gestire, Da ricontattare, Inviate oggi.

## Schema DB

Migrazione: `supabase/migrations/20261030120000_preventivi.sql`.
Cinque tabelle (`contatti`, `richieste_preventivo`, `richieste_eventi`,
`template_risposta`, `preventivi_impostazioni`) con RLS admin
(`profiles.role = 'admin'`). Trigger automatici gestiscono
`data_invio`, `data_chiusura`, `updated_at`, e scrivono il log
`cambio_stato` in `richieste_eventi`.

I seed inseriscono tre template segnaposto (`raduno`, `scuola`,
`famiglia`) e le soglie di follow-up iniziali
(`{raduno:7, scuola:14, famiglia:3}`). Entrambi modificabili dalla
pagina **Impostazioni**.

## Edge Functions

Tre funzioni in `supabase/functions/`:

### `preventivi-da-email`

Webhook chiamato da Make quando in Gmail (`info@aschotel.com`) viene
applicata a mano l'etichetta "Preventivo".

- **URL:** `POST https://<project>.supabase.co/functions/v1/preventivi-da-email`
- **Header:** `x-webhook-secret: <PREVENTIVI_WEBHOOK_SECRET>`
- **Body JSON:**
  ```json
  {
    "gmail_message_id": "17a...",
    "from_name": "Mario Rossi",
    "from_email": "mario@example.com",
    "subject": "Richiesta preventivo gruppo",
    "body_text": "Buongiorno, siamo un gruppo di 20 persone...",
    "link": "https://mail.google.com/mail/u/0/#inbox/17a..."
  }
  ```
- **Idempotente** su `gmail_message_id`: se gia' importato, risponde
  `{ok:true, duplicate:true, richiesta_id}` senza duplicare.
- Estrazione campi via Claude Haiku 5.5, bozza via Claude Sonnet 5.5
  (configurabili con `AI_MODEL_ESTRAZIONE` e `AI_MODEL_BOZZA`).
- I segnaposto `[PREZZO ...]` restano intatti: l'AI non inventa
  prezzi.

### `preventivi-rigenera-bozza`

Chiamata dalla scheda richiesta con il pulsante "Rigenera bozza".

- **URL:** `POST /functions/v1/preventivi-rigenera-bozza`
- **Header:** `Authorization: Bearer <access_token admin>`
- **Body JSON:** `{ "richiesta_id": "<uuid>" }`

### `preventivi-cron`

Schedulata su **Make**, cron alle **09:00 Europe/Rome**.

- **URL:** `POST /functions/v1/preventivi-cron`
- **Header:** `x-cron-secret: <PREVENTIVI_CRON_SECRET>`
- Passaggi:
  1. `inviato → attesa` per richieste con `data_invio` prima di oggi.
  2. `inviato|attesa → scaduta` quando `data_arrivo < oggi`.
  3. Riepilogo "Nuove da gestire" + "Da ricontattare" su Telegram.
- **Email a info@aschotel.com**: non ancora inviata. Il progetto non
  ha un provider email configurato (`admin-users`, `sign-contract` e
  `notify-order` non ne usano uno). Quando si decidera' il provider,
  aggiungere l'invio in questa funzione.

## Deploy

```bash
# migrazione
supabase db push

# funzioni
supabase functions deploy preventivi-da-email --no-verify-jwt
supabase functions deploy preventivi-rigenera-bozza
supabase functions deploy preventivi-cron --no-verify-jwt

# secrets (una tantum)
supabase secrets set \
  ANTHROPIC_API_KEY=sk-... \
  PREVENTIVI_WEBHOOK_SECRET=... \
  PREVENTIVI_CRON_SECRET=... \
  TELEGRAM_BOT_TOKEN=... \
  TELEGRAM_CHAT_ID=... \
  APP_URL=https://co.aschotel.com
```

I secret ottimali `AI_MODEL_ESTRAZIONE` e `AI_MODEL_BOZZA` possono
restare non impostati: default `claude-haiku-5-5` e `claude-sonnet-5-5`.

## Flusso "Apri in Gmail"

La reception usa Gmail web (info@aschotel.com). Dal pulsante nella
scheda richiesta:

1. Se la richiesta e' in stato *Ricevuta* o *Scaduta*, viene prima
   impostata a *Inviato* (lato DB, con `operatore_invio = utente
   corrente`; `data_invio` la mette il trigger).
2. Si apre in nuova tab `https://mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...`
   coi dati del contatto e della bozza.
3. L'invio vero avviene in Gmail: non siamo in grado di confermarlo,
   per questo il bottone "Torna a Ricevuta" permette un rollback
   immediato in caso di errore umano.

## Integrazione Make — note

- **Scenario Gmail → preventivi-da-email**: trigger "Watch Labels" con
  l'etichetta `Preventivo`. HTTP → fai una POST con il body sopra e
  l'header `x-webhook-secret`.
- **Scheduler quotidiano**: trigger Scheduler a 09:00 Europe/Rome,
  HTTP → chiama `preventivi-cron` con `x-cron-secret`. Nessun body
  necessario.
