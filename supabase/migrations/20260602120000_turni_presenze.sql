-- ============================================================
-- Migration: Turni & presenze dipendenti — schema completo
-- ============================================================
-- Questa migrazione introduce TUTTO lo schema DB del modulo
-- "turni e presenze", anche le parti la cui UI arriva in fasi
-- successive, per non spezzare lo schema in piu' migrazioni.
--
-- FASE 1 (UI in questo intervento):
--   - dipendenti        : anagrafica dipendenti (righe della griglia)
--   - shift_templates   : orari predefiniti riutilizzabili
--   - shifts            : i turni assegnati dall'admin nella griglia
--
-- FASE 2 (solo schema ora, UI successiva):
--   - shift_change_requests : richieste dipendente di modifica orario
--                             (con approvazione admin)
--   - leave_requests        : ferie (in approvazione) e malattia
--                             (diretta, con certificato)
--   - bucket storage 'certificati' : PDF/foto dei certificati di malattia
--
-- AUTH/RLS: in Fase 1 i dipendenti NON hanno login. L'accesso a
-- queste tabelle e' quindi riservato all'admin (stesso pattern di
-- admin_all_rooms in schema_dayuse.sql). Le policy "own row" per i
-- dipendenti (collegati via dipendenti.profile_id) si aggiungeranno
-- in Fase 2, quando avranno un account auth.users.
-- ============================================================


-- ------------------------------------------------------------
-- 1. dipendenti
-- ------------------------------------------------------------
-- profile_id: nullable, collega (in Fase 2) il dipendente a un
-- utente auth.users per il login self-service. In Fase 1 resta null.
-- ordine: ordinamento manuale delle righe nella griglia.
create table if not exists dipendenti (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cognome     text,
  ruolo       text,
  attivo      boolean not null default true,
  ordine      int,
  profile_id  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_dipendenti_attivo  on dipendenti (attivo);
create index if not exists idx_dipendenti_profile on dipendenti (profile_id);


-- ------------------------------------------------------------
-- 2. shift_templates (turni predefiniti riutilizzabili)
-- ------------------------------------------------------------
-- Orari ricorrenti che l'admin riusa nel popover di inserimento
-- (es. "Mattina 08:00-14:00"). Uno spezzato viene gestito a livello
-- applicativo come due shift distinti nella stessa cella.
create table if not exists shift_templates (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  start_time  time not null,
  end_time    time not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 3. shifts (turni assegnati)
-- ------------------------------------------------------------
-- Nessun UNIQUE su (dipendente_id, data): una cella puo' contenere
-- piu' turni nello stesso giorno (turni spezzati).
create table if not exists shifts (
  id             uuid primary key default gen_random_uuid(),
  dipendente_id  uuid not null references dipendenti(id) on delete cascade,
  data           date not null,
  start_time     time not null,
  end_time       time not null,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_shifts_data on shifts (data);
create index if not exists idx_shifts_dip  on shifts (dipendente_id);


-- ------------------------------------------------------------
-- 4. shift_change_requests (FASE 2 — solo schema ora)
-- ------------------------------------------------------------
-- Il dipendente propone una modifica all'orario di un proprio shift;
-- l'admin approva (allora lo shift viene aggiornato) o rifiuta.
create table if not exists shift_change_requests (
  id              uuid primary key default gen_random_uuid(),
  shift_id        uuid references shifts(id) on delete cascade,
  dipendente_id   uuid references dipendenti(id) on delete cascade,
  requested_data  date,
  requested_start time,
  requested_end   time,
  motivo          text,
  stato           text not null default 'pending'
                    check (stato in ('pending','approved','rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null
);

create index if not exists idx_scr_dip   on shift_change_requests (dipendente_id);
create index if not exists idx_scr_stato on shift_change_requests (stato);


-- ------------------------------------------------------------
-- 5. leave_requests — ferie e malattia (FASE 2 — solo schema ora)
-- ------------------------------------------------------------
-- type='ferie'   -> alla creazione stato 'pending' (richiede approvazione admin)
-- type='malattia'-> alla creazione stato 'approved' (inserimento diretto,
--                   con certificato caricato nel bucket 'certificati')
-- La distinzione di stato iniziale e' applicativa (Fase 2): il default
-- colonna resta 'pending', l'app imposta 'approved' per la malattia.
-- certificate_url: path dell'oggetto nel bucket 'certificati'
--                  (scheme 'cert/<dipendente_id>/<leave_request_id>.<ext>').
create table if not exists leave_requests (
  id              uuid primary key default gen_random_uuid(),
  dipendente_id   uuid not null references dipendenti(id) on delete cascade,
  type            text not null check (type in ('ferie','malattia')),
  start_date      date not null,
  end_date        date not null,
  certificate_url text,
  note            text,
  stato           text not null default 'pending'
                    check (stato in ('pending','approved','rejected')),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_leave_dip   on leave_requests (dipendente_id);
create index if not exists idx_leave_start on leave_requests (start_date);


-- ------------------------------------------------------------
-- 6. RLS — admin full access su tutte le tabelle
-- ------------------------------------------------------------
-- Pattern identico ad admin_all_rooms (schema_dayuse.sql) e
-- contracts_admin_write (contract_signatures). In Fase 1 nessun
-- accesso ai dipendenti: arriva in Fase 2 con policy "own row".
alter table dipendenti            enable row level security;
alter table shift_templates       enable row level security;
alter table shifts                enable row level security;
alter table shift_change_requests enable row level security;
alter table leave_requests        enable row level security;

create policy "admin_all_dipendenti" on dipendenti for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_shift_templates" on shift_templates for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_shifts" on shifts for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_shift_change_requests" on shift_change_requests for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_leave_requests" on leave_requests for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));


-- ------------------------------------------------------------
-- 7. RLS — storage.objects per il bucket privato 'certificati'
-- ------------------------------------------------------------
-- Il bucket 'certificati' va creato dalla dashboard Supabase come
-- PRIVATO (come 'contract-signatures'). Le policy qui sotto si
-- possono applicare anche prima della creazione del bucket.
-- Path scheme: 'cert/<dipendente_id>/<leave_request_id>.<ext>'.
--
-- Fase 1: solo lettura admin. Upload via Edge Function con service
-- role (bypassa RLS), come per 'contract-signatures'. Le policy di
-- upload/read "own" per i dipendenti si aggiungono in Fase 2.
create policy "cert_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificati'
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
