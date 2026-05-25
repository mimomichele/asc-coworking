-- ============================================================
-- Migration: bookings.head_member_id (NOT NULL) + booking_guests
-- ============================================================
-- Modello prenotazione = nucleo/camera (decisione 2026-05-20):
--   - bookings.head_member_id identifica il capofamiglia del nucleo
--     per quella prenotazione.
--   - booking_guests elenca TUTTI i membri presenti sotto la
--     prenotazione, capo incluso.
--
-- IMPORTANTE — questa migration era stata applicata sul DB prima di
-- essere committata nel repo. Il disallineamento codice/DB ha causato
-- un bug: il frontend (GuestHome.confirmBooking) inseriva bookings
-- senza head_member_id, finendo in "23502 null value violates
-- not-null constraint". Ora il file e' tracciato qui per evitare
-- ricadute. Convenzione: ogni futura modifica del DB = nuovo file
-- in supabase/migrations/ con timestamp.
--
-- Idempotente: rieseguibile senza effetti collaterali.
-- ============================================================


-- ------------------------------------------------------------
-- 1. bookings.head_member_id (capo nucleo della prenotazione)
-- ------------------------------------------------------------
-- La colonna member_id esistente resta e continua a puntare al
-- capo nucleo: cosi' la unique(member_id, date) gia' presente
-- vale come "un capo non puo' avere 2 prenotazioni nello stesso
-- giorno". head_member_id rende il ruolo esplicito.
alter table bookings
  add column if not exists head_member_id uuid references members(id);

-- Backfill righe pre-esistenti: il capo coincide con member_id.
update bookings
  set head_member_id = member_id
  where head_member_id is null;

-- Vincolo definitivo: ogni prenotazione DEVE avere un capo nucleo.
alter table bookings
  alter column head_member_id set not null;

create index if not exists idx_bookings_head_member
  on bookings (head_member_id);


-- ------------------------------------------------------------
-- 2. booking_guests (tutti i membri del nucleo per quella
--                    prenotazione, capo INCLUSO)
-- ------------------------------------------------------------
-- Il capo e' duplicato qui per comodita' di query:
--   - lista completa nucleo: select * from booking_guests where booking_id=...
--   - chi e' il capo: bookings.head_member_id (single source of truth)
create table if not exists booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade not null,
  member_id  uuid references members(id)  on delete restrict not null,
  created_at timestamptz default now(),
  unique (booking_id, member_id)
);

create index if not exists idx_booking_guests_booking
  on booking_guests (booking_id);
create index if not exists idx_booking_guests_member
  on booking_guests (member_id);

-- Backfill: per ogni booking pre-esistente inserisci almeno il capo.
insert into booking_guests (booking_id, member_id)
  select id, head_member_id from bookings
on conflict do nothing;

-- NB: la regola "un membro non puo' essere in due prenotazioni
-- attive nella stessa data" e' enforced lato app (servirebbe un
-- trigger o una colonna denormalizzata; rinviato).


-- ------------------------------------------------------------
-- 3. RLS booking_guests
-- ------------------------------------------------------------
alter table booking_guests enable row level security;

-- Admin (reception): pieno accesso.
-- Nota: create policy non supporta IF NOT EXISTS. Se questa
-- migration viene ri-eseguita su un DB dove e' gia' stata applicata,
-- queste due CREATE POLICY falliranno. In tal caso droppale prima:
--   drop policy if exists "admin_all_booking_guests" on booking_guests;
--   drop policy if exists "guest_own_booking_guests" on booking_guests;
create policy "admin_all_booking_guests" on booking_guests for all
  using (exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ));

-- Guest (abbonato): vede e gestisce solo le righe delle prenotazioni
-- del proprio account (prenota per se' + nucleo familiare).
create policy "guest_own_booking_guests" on booking_guests for all
  using (
    booking_id in (
      select b.id
      from bookings b
      join accounts a on a.id = b.account_id
      where a.owner_id = auth.uid()
    )
  );
