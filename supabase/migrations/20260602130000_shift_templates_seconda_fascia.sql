-- ============================================================
-- Migration: shift_templates — seconda fascia (turni spezzati)
-- ============================================================
-- Un turno "spezzato" sono due fasce orarie nello stesso giorno
-- (es. 09:00-13:00 / 16:00-20:00). Aggiungiamo due colonne
-- OPZIONALI per la seconda fascia. Un template e' "spezzato"
-- quando start_time_2 ed end_time_2 sono valorizzate.
--
-- Nullable + add column if not exists → i template esistenti a
-- fascia singola restano intatti (start_time_2/end_time_2 = null).
--
-- A livello di dati i due segmenti restano DUE shift distinti nella
-- tabella `shifts` (una cella puo' contenere piu' turni): qui
-- estendiamo solo il TEMPLATE, non lo schema degli shift.
-- ============================================================

alter table shift_templates add column if not exists start_time_2 time;
alter table shift_templates add column if not exists end_time_2   time;
