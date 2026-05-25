-- ============================================================
-- Migration: accounts.attivo — soft-deactivation degli ospiti
-- ============================================================
-- Permette di disattivare un ospite senza cancellare i dati
-- (storico ingressi, abbonamenti e pagamenti restano in DB,
-- intoccati, per la contabilita').
--
-- Default true → tutti gli account esistenti restano attivi
-- dopo l'applicazione della migration.
--
-- RLS: nessuna policy nuova richiesta — admin_all_accounts
-- e guest_own_account gia' presenti coprono lettura e scrittura
-- (l'admin tocca il flag, il guest legge il suo per sapere
-- se il proprio account e' attivo).
--
-- Il blocco accesso effettivo e' duplice:
--   1) flag DB letto dal frontend in App.jsx (gating route guest)
--   2) ban su Supabase Auth via Edge Function admin-users
--      (action 'disable'/'enable')
-- Vedi project memory: "Disattivazione ospite (soft-delete)".
-- ============================================================

alter table accounts
  add column if not exists attivo boolean not null default true;

create index if not exists idx_accounts_attivo on accounts (attivo);
