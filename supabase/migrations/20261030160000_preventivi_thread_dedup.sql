-- ============================================================
-- Preventivi: dedup per thread Gmail
--
-- Una conversazione Gmail (thread) e' UNA richiesta di preventivo:
-- se la reception etichetta "Preventivo" piu' email dello stesso
-- thread (la richiesta iniziale + le reply), vogliamo salvare una
-- sola riga in richieste_preventivo e saltare in silenzio le altre.
--
-- Prima la dedup era solo per gmail_message_id (una riga per ogni
-- singolo messaggio); con un thread di 10 email generava 10 righe
-- sostanzialmente duplicate dallo stesso cliente.
-- ============================================================

alter table richieste_preventivo
  add column if not exists email_origine_thread_id text;

-- Unique parziale: lo stesso threadId non puo' esistere due volte,
-- ma le righe senza thread (es. richieste manuali) non confliggono.
create unique index if not exists richieste_thread_unique
  on richieste_preventivo(email_origine_thread_id)
  where email_origine_thread_id is not null;
