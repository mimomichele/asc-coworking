# Comunicazioni lavoratori intermittenti (contratto a chiamata)

Ogni giornata di un lavoratore con `dipendenti.a_chiamata = true` va comunicata
al Ministero del Lavoro prima dell'inizio del turno, con il modello ML-15-01
(email con allegato XML a intermittenti@pec.lavoro.gov.it).

## Come funziona

- **Anagrafica** (`/admin/turni/dipendenti`): flag «Contratto a chiamata»; se
  attivo sono obbligatori codice fiscale e codice comunicazione (16 caratteri
  della comunicazione UNILAV di assunzione). Vincolo anche nel DB.
- **Stato sul turno** (`shifts.com_stato`): `null` (non a chiamata),
  `da_comunicare`, `comunicato` (+ `com_inizio`/`com_fine` = date della riga
  del modulo con cui è stato inviato, `com_invio_id`). Gli stati sono gestiti
  da trigger, quindi valgono per ogni punto dell'app che scrive turni.
- **Annullamenti** (`intermittenti_annullamenti`): un turno comunicato poi
  cancellato o spostato apre un annullamento con le stesse date della riga
  originale. Il modulo annulla sempre la riga intera: se di una riga 10–12 si
  toglie l'11, si annulla 10–12 e il 10 e il 12 tornano da comunicare.
  Un turno spezzato (due fasce lo stesso giorno) conta come un solo giorno.
- **Riepilogo e invio**: nel planner, dopo ogni salvataggio di un turno a
  chiamata, si apre «Comunicazioni da inviare»; la stessa vista è in
  `/admin/turni/comunicazioni` insieme al registro. Giorni consecutivi = una
  riga; massimo 10 righe per invio (oltre, più invii). Nessun invio senza il
  click «Conferma e invia» di un admin.
- **Invio**: Edge Function `invia-intermittenti` (verifica admin, ricalcola
  tutto dal DB, genera l'XML, manda l'email via SMTP, scrive il registro
  `intermittenti_invii`, aggiorna gli stati). Se l'SMTP fallisce i turni
  restano da comunicare e l'errore è nel registro e a video.
- **Logica pura condivisa**: `supabase/functions/_shared/intermittenti.js`
  (raggruppamento, XML, validazioni), test in `tests/` con `npm test`.

## Messa in produzione

1. Eseguire `supabase/migrations/20261010150000_intermittenti.sql` nel SQL
   editor di Supabase (idempotente).
2. Secret della funzione (Dashboard → Edge Functions → Secrets, oppure
   `npx supabase secrets set NOME=valore`): `SMTP_HOST`, `SMTP_PORT`
   (465 TLS, 587 STARTTLS), `SMTP_USER`, `SMTP_PASS`, `INTERMITTENTI_PROVA`
   (`1` = le email vanno solo ad amministrazione@aschotel.com).
3. Deploy: `npx supabase functions deploy invia-intermittenti`.
4. **Prima di togliere la prova**: confrontare byte per byte l'XML generato
   (scaricabile dal registro) con uno prodotto dal modulo originale: formato
   date (oggi AAAA-MM-GG in `fmtDataXml`), nome allegato
   (`COSTANTI.nomeAllegato`), intestazione e indentazione in `generaXml`.
   Aggiornare il test «XML: struttura ML-15-01» con l'XML vero.
