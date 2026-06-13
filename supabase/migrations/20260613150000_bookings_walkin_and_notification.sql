-- ============================================================
-- Migration: bookings walk-in registration + guest notification
-- ============================================================
-- Permette all'admin di registrare a posteriori un ingresso
-- "walk-in" per un ospite che NON ha prenotato online. L'ingresso
-- scala l'abbonamento del membro come una prenotazione normale,
-- in transazione atomica (RPC).
--
-- L'ospite, alla home successiva, vede un banner non-bloccante
-- ("La direzione ha registrato un tuo ingresso del GG/MM/AAAA")
-- dismissibile, finche' non lo chiude.
--
-- COSA TOCCA:
--   1. bookings.source CHECK esteso con 'admin_walkin'
--   2. bookings.notifica_da_mostrare (bool, default false)
--   3. bookings.created_by (uuid → auth.users, audit walk-in)
--   4. unique index parziale (member_id, date) — un ospite,
--      un ingresso al giorno, qualunque sia source/origine
--   5. RPC register_walkin_entry — transazione atomica
--      check + INSERT booking + UPDATE entries_used
--   6. Trigger bookings_lock_walkin_columns — vieta a non-admin
--      di scrivere/modificare colonne sensibili al walk-in
-- ============================================================

-- 1. Estendi CHECK su source per ammettere 'admin_walkin'
alter table bookings drop constraint if exists bookings_source_check;
alter table bookings add constraint bookings_source_check
  check (source in ('reception','app','admin_walkin'));

-- 2. Colonna notifica banner guest (true solo per walk-in pendenti)
alter table bookings add column if not exists
  notifica_da_mostrare boolean not null default false;

-- 3. Audit chi ha registrato il walk-in (NULL per prenotazioni normali)
alter table bookings add column if not exists
  created_by uuid references auth.users(id);

-- 4. Unique parziale: stesso ospite non puo' avere due ingressi
--    attivi nello stesso giorno (qualsiasi origine). cancelled non blocca.
create unique index if not exists uniq_member_date_active
  on bookings (member_id, date)
  where status in ('booked','confirmed');


-- ============================================================
-- 5. RPC register_walkin_entry
-- ============================================================
-- Chiamata dal modal admin. Tutto in transazione:
--   a. caller deve essere admin
--   b. data <= oggi (no walk-in futuri)
--   c. lock + verifica abbonamento (active + non esaurito)
--   d. INSERT booking source='admin_walkin', checked_in=true,
--      checkin_at=now(), notifica_da_mostrare=true,
--      created_by=auth.uid()
--   e. UPDATE entries_used + 1 sull'abbonamento lockato
-- Errori distinguibili dal client (error.message):
--   'not_admin', 'future_date', 'sub_not_found',
--   'sub_not_active', 'sub_exhausted'
-- + 23505 (unique_violation) se duplicato giorno → mappato
--   client-side a "Esiste gia' un ingresso per questo giorno".
-- ============================================================
create or replace function register_walkin_entry(
  p_account_id      uuid,
  p_member_id       uuid,
  p_subscription_id uuid,
  p_date            date
) returns bookings
language plpgsql
security invoker
as $$
declare
  v_is_admin boolean;
  v_sub      subscriptions%rowtype;
  v_today    date;
  v_new      bookings;
begin
  -- a. caller deve essere admin
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  -- b. niente walk-in nel futuro (e' un ingresso gia' avvenuto)
  v_today := (now() at time zone 'Europe/Rome')::date;
  if p_date > v_today then
    raise exception 'future_date' using errcode = 'P0001';
  end if;

  -- c. lock + verifica abbonamento
  select * into v_sub
  from subscriptions
  where id = p_subscription_id
  for update;
  if not found then
    raise exception 'sub_not_found' using errcode = 'P0001';
  end if;
  if not v_sub.active then
    raise exception 'sub_not_active' using errcode = 'P0001';
  end if;
  if v_sub.entries_used >= v_sub.entries_total then
    raise exception 'sub_exhausted' using errcode = 'P0001';
  end if;

  -- d. INSERT booking. Eventuale unique_violation (23505) propaga
  --    e fa rollback dello statement → l'app la mostra come
  --    "Esiste gia' un ingresso per questo giorno".
  insert into bookings (
    member_id, head_member_id, account_id, subscription_id,
    date, status, source, payment_kind,
    checked_in, checkin_at, notifica_da_mostrare, created_by
  ) values (
    p_member_id, p_member_id, p_account_id, p_subscription_id,
    p_date, 'confirmed', 'admin_walkin', 'subscription',
    true, now(), true, auth.uid()
  )
  returning * into v_new;

  -- e. decremento atomico (riga lockata sopra)
  update subscriptions
  set entries_used = entries_used + 1
  where id = p_subscription_id;

  return v_new;
end;
$$;

grant execute on function register_walkin_entry(uuid, uuid, uuid, date)
  to authenticated;


-- ============================================================
-- 6. Trigger bookings_lock_walkin_columns
-- ============================================================
-- La policy RLS guest_own_bookings e' "for all" → un guest
-- potrebbe via fetch manuale fare INSERT/UPDATE su colonne
-- sensibili (source, created_by, notifica_da_mostrare). Questo
-- trigger lo blocca a livello DB:
--   INSERT da non-admin:
--     - source NON puo' essere 'admin_walkin'
--     - notifica_da_mostrare DEVE essere false
--     - created_by DEVE essere NULL
--   UPDATE da non-admin:
--     - source IMMUTABILE
--     - created_by IMMUTABILE
--     - notifica_da_mostrare: consentita SOLO transizione true→false
--       (il guest puo' dismettere il banner, ma non riaprirlo)
--
-- L'admin (e il RPC register_walkin_entry che gira come l'admin
-- via security invoker) sono pass-through.
-- ============================================================
create or replace function bookings_lock_walkin_columns()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;

  -- admin → nessun controllo (incluso il RPC che gira come admin)
  if v_is_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source = 'admin_walkin' then
      raise exception 'INSERT con source=admin_walkin riservato all''admin'
        using errcode = '42501';
    end if;
    if new.notifica_da_mostrare = true then
      raise exception 'INSERT con notifica_da_mostrare=true riservato all''admin'
        using errcode = '42501';
    end if;
    if new.created_by is not null then
      raise exception 'INSERT con created_by riservato all''admin'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.source is distinct from old.source then
      raise exception 'modifica di source non consentita'
        using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'modifica di created_by non consentita'
        using errcode = '42501';
    end if;
    -- notifica_da_mostrare: consentita SOLO true → false
    if new.notifica_da_mostrare is distinct from old.notifica_da_mostrare
       and not (old.notifica_da_mostrare = true
                and new.notifica_da_mostrare = false) then
      raise exception 'modifica di notifica_da_mostrare non consentita'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_lock_walkin on bookings;
create trigger trg_bookings_lock_walkin
  before insert or update on bookings
  for each row
  execute function bookings_lock_walkin_columns();
