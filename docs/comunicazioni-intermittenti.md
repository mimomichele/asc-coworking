# Comunicazioni obbligatorie lavoratori intermittenti

Per i dipendenti con **Contratto a chiamata** la webapp prepara e invia al
Ministero del Lavoro la comunicazione dei giorni di lavoro (modulo
UNI-Intermittenti ML-15-01), dopo la conferma di un admin.

## Come funziona

1. In **Turni → Dipendenti** si attiva "Contratto a chiamata" e si inseriscono
   codice fiscale, codice comunicazione (UNILAV, 16 cifre) e la data da cui
   comunicare i turni.
2. Quando si inseriscono, spostano o cancellano turni di quel lavoratore, nel
   planner compare il banner **Comunicazioni da inviare** e parte un avviso
   Telegram.
3. **Rivedi e invia** mostra le righe: giorni consecutivi su una riga (max 30
   giorni), giorni staccati una riga ciascuno, massimo 10 righe per email.
4. **Conferma e invia** compila il modulo PDF ministeriale e lo spedisce in
   allegato a `intermittenti@pec.lavoro.gov.it` da
   `amministrazione@aschotel.com` (in copia nascosta a se stessa).
5. **Turni → Comunicazioni** è il registro di tutti gli invii, con l'XML.

Se a una riga già comunicata viene tolto un giorno, la riga viene annullata per
intero e i giorni rimasti vengono ricomunicati.

## Messa in produzione (in quest'ordine)

1. **Database**: eseguire `supabase/migrations/20261010120000_comunicazioni_intermittenti.sql`
   nel SQL Editor di Supabase. Va fatto PRIMA di pubblicare il frontend,
   altrimenti il salvataggio dei dipendenti dà errore.
2. **Secret** della function (Supabase → Edge Functions → Secrets):
   - `SMTP_USER`: l'account Gmail che possiede l'alias amministrazione@aschotel.com
   - `SMTP_PASS`: una "password per le app" di quell'account Google
   - `TELEGRAM_CHAT_ID_INTERMITTENTI`: la chat che riceve gli avvisi
   - `TELEGRAM_BOT_TOKEN`: già presente (lo usa notify-order)
   - `INTERMITTENTI_PROVA`: NON impostarlo per ora (prova attiva di default)
3. **Function**: `supabase functions deploy intermittenti`
4. **Frontend**: merge della pull request (Vercel pubblica da solo).

## Modalità di prova

Finché il secret `INTERMITTENTI_PROVA` non vale esattamente `false`, le email
vanno solo a amministrazione@aschotel.com con oggetto `[PROVA] ...` e nessun
turno viene segnato come comunicato.

Prima di impostare `INTERMITTENTI_PROVA=false`:

- aprire in Adobe Acrobat Reader il PDF arrivato nell'email di prova e
  controllare che sia identico a un modulo compilato a mano (codici, date
  `GG/MM/AAAA`, casella Annullamento);
- verificare che l'email di prova risulti inviata da amministrazione@aschotel.com.

## Test

`npm test` — raggruppamento delle date, calcolo di comunicazioni e
annullamenti, generazione dell'XML (`tests/intermittenti.test.js`).
La logica è in `supabase/functions/_shared/intermittenti.ts`.
