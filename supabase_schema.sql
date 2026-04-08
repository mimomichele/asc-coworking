-- ============================================================
-- ASC HOTEL — Schema database Supabase
-- Esegui questo file nel SQL Editor di Supabase
-- ============================================================

-- Profili utenti (collegati a auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  email text unique not null,
  role text not null default 'guest' check (role in ('admin', 'guest')),
  created_at timestamptz default now()
);

-- Tipi di abbonamento
create table subscription_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entries_total int not null,
  duration_months int,
  price numeric(10,2) not null,
  created_at timestamptz default now()
);

-- Account (il referente/pagante)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  name text not null,
  surname text not null,
  phone text,
  username text unique not null,
  type text not null default 'single' check (type in ('single', 'family')),
  created_at timestamptz default now()
);

-- Membri (ogni persona fisica dentro un account)
create table members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade not null,
  name text not null,
  surname text not null,
  created_at timestamptz default now()
);

-- Abbonamenti (uno per membro, possono essere più nel tempo)
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade not null,
  subscription_type_id uuid references subscription_types(id),
  entries_total int not null,
  entries_used int not null default 0,
  expiry_date date not null,
  paid_amount numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Prenotazioni / ingressi
create table bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete cascade not null,
  subscription_id uuid references subscriptions(id),
  date date not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'cancelled')),
  created_at timestamptz default now(),
  unique(member_id, date)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table accounts enable row level security;
alter table members enable row level security;
alter table subscriptions enable row level security;
alter table bookings enable row level security;
alter table subscription_types enable row level security;

-- Profiles: ognuno vede solo il proprio
create policy "profiles_own" on profiles for all using (auth.uid() = id);

-- Admin vede tutto (ruolo salvato in profiles)
create policy "admin_all_accounts" on accounts for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_members" on members for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_subscriptions" on subscriptions for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_bookings" on bookings for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "admin_all_types" on subscription_types for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Guest vede solo il suo account
create policy "guest_own_account" on accounts for select
  using (owner_id = auth.uid());

create policy "guest_own_members" on members for select
  using (account_id in (select id from accounts where owner_id = auth.uid()));

create policy "guest_own_subscriptions" on subscriptions for select
  using (member_id in (select m.id from members m join accounts a on m.account_id = a.id where a.owner_id = auth.uid()));

create policy "guest_update_subscriptions" on subscriptions for update
  using (member_id in (select m.id from members m join accounts a on m.account_id = a.id where a.owner_id = auth.uid()));

create policy "guest_own_bookings" on bookings for all
  using (account_id in (select id from accounts where owner_id = auth.uid()));

create policy "guest_read_types" on subscription_types for select using (true);

-- ============================================================
-- DATI DI ESEMPIO (opzionale, per testare)
-- ============================================================

insert into subscription_types (name, entries_total, duration_months, price) values
  ('Base — 5 ingressi', 5, 3, 180),
  ('Standard — 10 ingressi', 10, 6, 360),
  ('Plus — 20 ingressi', 20, 6, 600),
  ('Annuale — 40 ingressi', 40, 12, 1100);
