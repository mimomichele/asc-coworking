-- ============================================================
-- ASC HOTEL — Gestionale DAY USE
-- Estensione dello schema esistente (coworking) per:
--   • camere day use (fascia oraria, disponibilità)
--   • registrazione ospiti conforme Alloggiati Web
--   • abbonamento (Netflix) + acquisto singolo (reception)
--   • imposta di soggiorno (3€, esenti residenti AR e under 14)
--   • tabelle di codifica ufficiali Alloggiati
-- Eseguire nel SQL Editor di Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 0. SI RIUSA DALLO SCHEMA ESISTENTE:
--    profiles, subscription_types, accounts, members,
--    subscriptions, bookings
--    Qui le ESTENDIAMO con ALTER TABLE dove serve.
-- ------------------------------------------------------------


-- ============================================================
-- 1. CAMERE
-- ============================================================
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- es. "Camera 101"
  room_type text not null default 'quadrupla'
      check (room_type in ('doppia','tripla','quadrupla')),
  capacity int not null,                    -- posti letto reali (tetto del nucleo)
  active boolean not null default true,     -- camera utilizzabile per day use
  notes text,
  created_at timestamptz default now()
);


-- ============================================================
-- 2. ESTENSIONE ANAGRAFICA OSPITI (members)
--    Aggiungiamo i campi richiesti dal tracciato Alloggiati
--    e il flag residenza per l'esenzione imposta di soggiorno.
--    NB: i codici (comune/stato/documento) sono i CODICI delle
--    tabelle ufficiali Alloggiati, non il testo in chiaro.
-- ============================================================
alter table members add column if not exists sesso text
      check (sesso in ('1','2'));                   -- 1=M, 2=F (formato tracciato)
alter table members add column if not exists data_nascita date;
alter table members add column if not exists comune_nascita_cod text;   -- 9 char, tab. Comuni (solo se IT)
alter table members add column if not exists provincia_nascita text;    -- 2 char, sigla (RM per Roma)
alter table members add column if not exists stato_nascita_cod text;    -- 9 char, tab. Stati (sempre)
alter table members add column if not exists cittadinanza_cod text;     -- 9 char, tab. Stati (sempre)
alter table members add column if not exists tipo_documento_cod text;   -- 5 char, tab. Documenti
alter table members add column if not exists numero_documento text;     -- max 20 char
alter table members add column if not exists luogo_rilascio_cod text;   -- 9 char, tab. Stati o Comuni
alter table members add column if not exists documento_acquisito boolean not null default false;
alter table members add column if not exists residente_arezzo boolean not null default false; -- esenzione imposta


-- ============================================================
-- 3. ESTENSIONE ABBONAMENTI (subscription_types)
--    Aggiungiamo il tipo: a numero accessi vs a tempo (Netflix).
-- ============================================================
alter table subscription_types add column if not exists kind text
      not null default 'entries'
      check (kind in ('entries','time'));           -- entries = a scalare, time = a tempo illimitato
-- (entries_total resta per i pacchetti a scalare;
--  per kind='time' si usa duration_months e si ignora entries_total)


-- ============================================================
-- 4. ESTENSIONE PRENOTAZIONI (bookings)
--    La prenotazione ora è di una CAMERA in una FASCIA,
--    e può essere SPOT (pagata) o da ABBONAMENTO (scala accesso).
-- ============================================================
alter table bookings add column if not exists room_id uuid references rooms(id);
alter table bookings add column if not exists slot_start time not null default '10:00';
alter table bookings add column if not exists slot_end   time not null default '18:00';
alter table bookings add column if not exists source text
      not null default 'reception'
      check (source in ('reception','app'));         -- chi ha creato la prenotazione
alter table bookings add column if not exists payment_kind text
      not null default 'subscription'
      check (payment_kind in ('subscription','spot')); -- da abbonamento o acquisto singolo
alter table bookings add column if not exists price_paid numeric(10,2) default 0; -- valorizzato se spot
alter table bookings add column if not exists checked_in boolean not null default false; -- presenza confermata in reception
alter table bookings add column if not exists checkin_at timestamptz;            -- quando la reception conferma l'arrivo
alter table bookings add column if not exists alloggiati_sent boolean not null default false; -- incluso in un export

-- Una camera non può essere prenotata due volte nella stessa data/fascia
-- (vincolo semplice: una prenotazione attiva per camera+data)
create unique index if not exists uniq_room_date_active
  on bookings (room_id, date)
  where status in ('booked','confirmed');


-- ============================================================
-- 5. IMPOSTA DI SOGGIORNO
--    Registro dell'imposta calcolata per ogni ospite presente,
--    per produrre la dichiarazione/versamento al Comune.
-- ============================================================
create table tourist_tax_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade not null,
  member_id uuid references members(id) on delete cascade not null,
  date date not null,
  amount numeric(10,2) not null,            -- 3.00 se dovuta, 0 se esente
  exempt boolean not null default false,
  exempt_reason text,                       -- 'residente_arezzo' | 'minore_14' | null
  created_at timestamptz default now()
);


-- ============================================================
-- 6. TABELLE DI CODIFICA UFFICIALI ALLOGGIATI
--    Da popolare con i file scaricati dalla sezione Supporto
--    del portale Alloggiati (Comuni, Stati, Documenti, Tipi).
--    Servono per tradurre "Arezzo" -> codice, ecc. nell'export.
-- ============================================================
create table cod_comuni (
  codice text primary key,                  -- 9 char
  descrizione text not null,
  provincia text                            -- sigla (RM per Roma)
);

create table cod_stati (
  codice text primary key,                  -- 9 char
  descrizione text not null
);

create table cod_documenti (
  codice text primary key,                  -- 5 char (es. IDENT)
  descrizione text not null
);

create table cod_tipi_alloggiato (
  codice text primary key,                  -- 2 char (16/17/18/19/20)
  descrizione text not null
);

-- Tipi alloggiato noti dal tracciato (precaricati)
insert into cod_tipi_alloggiato (codice, descrizione) values
  ('16','Ospite Singolo'),
  ('17','Capo Famiglia'),
  ('18','Capo Gruppo'),
  ('19','Familiare'),
  ('20','Membro Gruppo')
on conflict do nothing;


-- ============================================================
-- 7. ROW LEVEL SECURITY (coerente con lo schema esistente)
-- ============================================================
alter table rooms enable row level security;
alter table tourist_tax_log enable row level security;
alter table cod_comuni enable row level security;
alter table cod_stati enable row level security;
alter table cod_documenti enable row level security;
alter table cod_tipi_alloggiato enable row level security;

-- Admin: pieno accesso alle nuove tabelle
create policy "admin_all_rooms" on rooms for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_all_tax" on tourist_tax_log for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Guest (abbonato): può LEGGERE le camere per vedere la disponibilità,
-- ma NON le tabelle di codifica né il registro imposta.
create policy "guest_read_rooms" on rooms for select using (true);

-- Tabelle di codifica: lettura consentita (servono all'app), scrittura solo admin
create policy "read_cod_comuni" on cod_comuni for select using (true);
create policy "read_cod_stati" on cod_stati for select using (true);
create policy "read_cod_documenti" on cod_documenti for select using (true);
create policy "read_cod_tipi" on cod_tipi_alloggiato for select using (true);
create policy "admin_write_cod_comuni" on cod_comuni for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_write_cod_stati" on cod_stati for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_write_cod_documenti" on cod_documenti for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_write_cod_tipi" on cod_tipi_alloggiato for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- NB: per le prenotazioni fatte dall'abbonato dall'app, valgono già
-- le policy "guest_own_bookings" dello schema esistente (l'ospite vede/crea
-- solo le prenotazioni del proprio account). La reception (admin) vede tutto.
