-- ============================================================
-- Migration: Compliance — scadenziario adempimenti (sezione interna)
-- ============================================================
-- Ricrea l'app esterna "ASC Compliance" come sezione del coworking,
-- riusando auth + Supabase del coworking. Adattamenti rispetto
-- all'originale (01_schema.sql):
--   - prefisso compliance_ su tutte le tabelle + vista (no collisioni)
--   - OMESSE notifiche_inviate e audit_log
--   - niente Google Drive: su compliance_rinnovi -> allegato_path /
--     allegato_nome (bucket privato 'compliance-docs')
--   - RLS ABILITATA admin-only (l'originale la disabilitava: single-user)
--   - vista con security_invoker=true (altrimenti bypasserebbe la RLS)
-- I trigger (calcolo data_scadenza, updated_at) e la vista scadenziario
-- sono mantenuti, adattati.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tabelle
-- ------------------------------------------------------------
create table if not exists compliance_categories (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  colore      text default '#1F4E78',
  icona       text default 'ti-folder',
  ordine      int default 0,
  attiva      boolean default true,
  created_at  timestamptz default now()
);

create table if not exists compliance_fornitori (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  contatto_referente text,
  email              text,
  telefono           text,
  note               text,
  attivo             boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists compliance_adempimenti (
  id                   uuid primary key default gen_random_uuid(),
  titolo               text not null,
  categoria_id         uuid references compliance_categories(id) on delete restrict,
  riferimento_normativo text,
  frequenza_mesi       int,                       -- null = ad evento (non periodico)
  fornitore_default_id uuid references compliance_fornitori(id),
  responsabile_interno text,
  icona                text default 'ti-file-text',
  note                 text,
  attivo               boolean default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  deleted_at           timestamptz                -- soft delete
);

create table if not exists compliance_rinnovi (
  id                     uuid primary key default gen_random_uuid(),
  adempimento_id         uuid not null references compliance_adempimenti(id) on delete cascade,
  data_rinnovo           date not null,
  data_scadenza_calcolata date,                   -- calcolata da trigger
  costo                  numeric(10,2),
  fornitore_id           uuid references compliance_fornitori(id),
  note                   text,
  allegato_path          text,                    -- path nel bucket 'compliance-docs'
  allegato_nome          text,                    -- nome file originale
  created_at             timestamptz default now(),
  created_by             uuid references auth.users(id) on delete set null
);


-- ------------------------------------------------------------
-- 2. Indici
-- ------------------------------------------------------------
create index if not exists idx_compliance_adempimenti_categoria on compliance_adempimenti(categoria_id);
create index if not exists idx_compliance_adempimenti_attivo on compliance_adempimenti(attivo) where deleted_at is null;
create index if not exists idx_compliance_rinnovi_adempimento on compliance_rinnovi(adempimento_id);
create index if not exists idx_compliance_rinnovi_scadenza on compliance_rinnovi(data_scadenza_calcolata);


-- ------------------------------------------------------------
-- 3. Trigger — calcolo automatico data_scadenza_calcolata
-- ------------------------------------------------------------
create or replace function compliance_calcola_scadenza()
returns trigger
language plpgsql
as $$
declare
  v_freq int;
begin
  select frequenza_mesi into v_freq
  from compliance_adempimenti where id = new.adempimento_id;

  if v_freq is not null then
    new.data_scadenza_calcolata := new.data_rinnovo + (v_freq || ' months')::interval;
  else
    new.data_scadenza_calcolata := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compliance_calcola_scadenza on compliance_rinnovi;
create trigger trg_compliance_calcola_scadenza
  before insert or update on compliance_rinnovi
  for each row execute function compliance_calcola_scadenza();


-- ------------------------------------------------------------
-- 4. Trigger — aggiorna updated_at
-- ------------------------------------------------------------
create or replace function compliance_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_compliance_adempimenti_updated on compliance_adempimenti;
create trigger trg_compliance_adempimenti_updated
  before update on compliance_adempimenti
  for each row execute function compliance_touch_updated_at();

drop trigger if exists trg_compliance_fornitori_updated on compliance_fornitori;
create trigger trg_compliance_fornitori_updated
  before update on compliance_fornitori
  for each row execute function compliance_touch_updated_at();


-- ------------------------------------------------------------
-- 5. Vista scadenziario
-- ------------------------------------------------------------
-- security_invoker=true: la vista rispetta la RLS delle tabelle base
-- (altrimenti girerebbe coi permessi dell'owner e bypasserebbe la RLS,
-- esponendo i dati via PostgREST a dipendenti/guest).
create or replace view v_compliance_scadenziario
with (security_invoker = true) as
with ultimo_rinnovo as (
  select distinct on (adempimento_id)
    adempimento_id,
    data_rinnovo,
    data_scadenza_calcolata,
    costo,
    fornitore_id,
    allegato_path,
    allegato_nome
  from compliance_rinnovi
  order by adempimento_id, data_rinnovo desc
)
select
  a.id,
  a.titolo,
  a.riferimento_normativo,
  a.frequenza_mesi,
  a.icona,
  a.responsabile_interno,
  a.note,
  c.id    as categoria_id,
  c.nome  as categoria,
  c.colore as categoria_colore,
  c.icona as categoria_icona,
  f.id    as fornitore_id,
  f.nome  as fornitore_nome,
  ur.data_rinnovo            as ultimo_rinnovo,
  ur.data_scadenza_calcolata as prossima_scadenza,
  ur.costo                   as ultimo_costo,
  ur.allegato_path           as ultimo_allegato_path,
  ur.allegato_nome           as ultimo_allegato_nome,
  case
    when ur.data_scadenza_calcolata is null then null
    else (ur.data_scadenza_calcolata - current_date)
  end as giorni_alla_scadenza,
  case
    when ur.data_scadenza_calcolata is null then 'mai_registrato'
    when (ur.data_scadenza_calcolata - current_date) < 0 then 'scaduto'
    when (ur.data_scadenza_calcolata - current_date) <= 30 then 'in_scadenza'
    when (ur.data_scadenza_calcolata - current_date) <= 60 then 'imminente'
    else 'in_regola'
  end as stato
from compliance_adempimenti a
left join compliance_categories c on a.categoria_id = c.id
left join compliance_fornitori  f on a.fornitore_default_id = f.id
left join ultimo_rinnovo ur on a.id = ur.adempimento_id
where a.attivo = true and a.deleted_at is null;


-- ------------------------------------------------------------
-- 6. RLS — admin-only (pattern admin-full dei turni)
-- ------------------------------------------------------------
alter table compliance_categories  enable row level security;
alter table compliance_fornitori   enable row level security;
alter table compliance_adempimenti enable row level security;
alter table compliance_rinnovi     enable row level security;

create policy "compliance_categories_admin" on compliance_categories for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "compliance_fornitori_admin" on compliance_fornitori for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "compliance_adempimenti_admin" on compliance_adempimenti for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "compliance_rinnovi_admin" on compliance_rinnovi for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));


-- ------------------------------------------------------------
-- 7. Storage — bucket privato 'compliance-docs' (admin-only)
-- ------------------------------------------------------------
-- Il bucket va creato a mano dalla dashboard come PRIVATO.
-- Path: 'compliance/<adempimento_id>/<rinnovo_id>.<ext>'.
-- Admin: lettura + scrittura. Nessun accesso per altri ruoli.
create policy "compliance_docs_admin_all" on storage.objects for all to authenticated
  using (
    bucket_id = 'compliance-docs'
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    bucket_id = 'compliance-docs'
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
