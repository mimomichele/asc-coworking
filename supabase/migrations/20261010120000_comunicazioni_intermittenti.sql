-- ============================================================
-- Migration: comunicazioni obbligatorie lavoratori intermittenti
-- (contratto a chiamata) — modulo ministeriale UNI-Intermittenti
-- ============================================================
-- 1. dipendenti: flag "a chiamata" + dati necessari al modulo
-- 2. intermittenti_invii : registro di ogni email inviata
-- 3. intermittenti_righe : righe comunicate al Ministero (intervalli
--    di date per lavoratore) con il loro stato
-- 4. intermittenti_stato : riga singola, ultimo avviso Telegram
--
-- Lo stato "da comunicare / da annullare" NON e' salvato: si ricava
-- confrontando i turni (shifts) con le righe comunicate. Cosi' non
-- serve toccare i punti dell'app che scrivono i turni.
--
-- Scritture su queste tabelle: SOLO dalla Edge Function
-- `intermittenti` (service role). Gli admin leggono soltanto.
-- ============================================================

alter table dipendenti add column if not exists a_chiamata           boolean not null default false;
alter table dipendenti add column if not exists codice_fiscale       text;
alter table dipendenti add column if not exists codice_comunicazione text;
-- Le comunicazioni partono dai turni da questa data in poi (evita di
-- trattare come "da comunicare" i turni storici).
alter table dipendenti add column if not exists a_chiamata_dal       date;

alter table dipendenti drop constraint if exists dipendenti_a_chiamata_dati;
alter table dipendenti add constraint dipendenti_a_chiamata_dati check (
  not a_chiamata or (
    codice_fiscale ~ '^[A-Z0-9]{16}$'
    and codice_comunicazione ~ '^[0-9]{16}$'
    and a_chiamata_dal is not null
  )
);

create table if not exists intermittenti_invii (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  admin_id     uuid references auth.users(id) on delete set null,
  admin_email  text,
  tipo         text not null check (tipo in ('comunicazione','annullamento')),
  righe        jsonb not null,          -- [{nome, codice_fiscale, codice_comunicazione, data_inizio, data_fine}]
  xml          text not null,
  destinatario text not null,
  prova        boolean not null default false,
  esito        text not null check (esito in ('ok','errore')),
  errore       text
);
create index if not exists idx_intermittenti_invii_created on intermittenti_invii (created_at desc);

create table if not exists intermittenti_righe (
  id                    uuid primary key default gen_random_uuid(),
  dipendente_id         uuid not null references dipendenti(id) on delete cascade,
  data_inizio           date not null,
  data_fine             date not null,
  stato                 text not null default 'comunicato' check (stato in ('comunicato','annullato')),
  invio_id              uuid references intermittenti_invii(id) on delete set null,
  annullamento_invio_id uuid references intermittenti_invii(id) on delete set null,
  created_at            timestamptz not null default now(),
  check (data_fine >= data_inizio)
);
create index if not exists idx_intermittenti_righe_dip on intermittenti_righe (dipendente_id, stato, data_fine);

create table if not exists intermittenti_stato (
  id                   int primary key default 1 check (id = 1),
  impronta_notificata  text not null default '',
  notificata_at        timestamptz
);
insert into intermittenti_stato (id) values (1) on conflict do nothing;

alter table intermittenti_invii enable row level security;
alter table intermittenti_righe enable row level security;
alter table intermittenti_stato enable row level security;

create policy "admin_read_intermittenti_invii" on intermittenti_invii for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_read_intermittenti_righe" on intermittenti_righe for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
