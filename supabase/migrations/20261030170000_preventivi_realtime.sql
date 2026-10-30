-- Realtime subscription per la tabella richieste_preventivo.
-- Serve al frontend (pagina admin Preventivi > Oggi) per aggiornarsi
-- da solo quando una nuova riga arriva (import da Make, creazione
-- manuale, ecc.) senza polling e senza che l'utente debba ricaricare.

alter publication supabase_realtime add table public.richieste_preventivo;
