-- ============================================================
-- Migration: subscription_types.disponibile_vendita
-- ============================================================
-- Permette all'admin di disattivare temporaneamente la vendita
-- di un tipo di abbonamento senza eliminarlo. Gli abbonamenti
-- gia' venduti restano validi e funzionanti per i clienti che
-- li hanno; il flag impatta SOLO sulle nuove vendite.
--
-- Default true: tutti i tipi esistenti restano disponibili.
-- Niente RLS nuova: admin_all_types gia' copre UPDATE.
-- Niente RPC, niente trigger: semplice colonna, UPDATE diretto
-- da TipiAbbonamento.jsx via supabase-js.
-- ============================================================

alter table subscription_types
  add column if not exists disponibile_vendita boolean not null default true;
