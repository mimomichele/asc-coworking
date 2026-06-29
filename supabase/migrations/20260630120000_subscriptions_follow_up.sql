-- ============================================================
-- Migration: subscriptions follow-up (sezione "Esauriti")
-- ============================================================
-- Tracking della telefonata di follow-up sugli abbonamenti
-- esauriti (entries_used >= entries_total): chiediamo all'ospite
-- se rinnova o no, e segniamo l'esito per non ricontattarlo
-- due volte.
--
-- 2 colonne nuove:
--   - follow_up_status text not null default 'pending'
--     (pending / no_renewal / renewed) — vincolato via CHECK
--   - follow_up_date timestamptz, NULL fino al primo click
--
-- Tutti i record esistenti prendono 'pending' di default.
-- Niente RLS nuova: admin_all_subscriptions copre UPDATE.
-- Niente trigger anti-guest (decisione: overengineering).
-- ============================================================

-- 1. Colonna follow_up_status con default 'pending'
alter table subscriptions
  add column if not exists follow_up_status text not null default 'pending';

-- 2. CHECK constraint (drop+recreate per idempotenza)
alter table subscriptions
  drop constraint if exists subscriptions_follow_up_status_check;
alter table subscriptions
  add constraint subscriptions_follow_up_status_check
  check (follow_up_status in ('pending', 'no_renewal', 'renewed'));

-- 3. Colonna follow_up_date (timestamptz, NULL inizialmente)
alter table subscriptions
  add column if not exists follow_up_date timestamptz;
