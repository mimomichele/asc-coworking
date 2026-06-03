-- ============================================================
-- Migration: Compliance — allegati multipli
-- ============================================================
-- Un rinnovo può avere PIÙ allegati; inoltre l'adempimento può avere
-- documenti GENERALI (slegati dai rinnovi). Nuova tabella
-- compliance_allegati su due livelli:
--   - rinnovo_id valorizzato  -> allegato di quel rinnovo
--   - rinnovo_id null          -> documento generale dell'adempimento
-- Le colonne compliance_rinnovi.allegato_path/allegato_nome restano ma
-- diventano OBSOLETE (il codice smette di usarle). Rimovibili in futuro.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tabella compliance_allegati
-- ------------------------------------------------------------
create table if not exists compliance_allegati (
  id             uuid primary key default gen_random_uuid(),
  adempimento_id uuid not null references compliance_adempimenti(id) on delete cascade,
  rinnovo_id     uuid references compliance_rinnovi(id) on delete cascade,  -- null = documento generale
  path           text not null,
  nome           text not null,
  mime           text,
  dimensione     bigint,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_compliance_allegati_adempimento on compliance_allegati(adempimento_id);
create index if not exists idx_compliance_allegati_rinnovo on compliance_allegati(rinnovo_id);


-- ------------------------------------------------------------
-- 2. RLS admin-only
-- ------------------------------------------------------------
alter table compliance_allegati enable row level security;

create policy "compliance_allegati_admin" on compliance_allegati for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));


-- ------------------------------------------------------------
-- 3. Migrazione dati: allegato singolo dei rinnovi esistenti
-- ------------------------------------------------------------
-- Idempotente (guardia su path già presente). Il file NON viene spostato:
-- la riga punta al path originale.
insert into compliance_allegati (adempimento_id, rinnovo_id, path, nome, created_by, created_at)
select r.adempimento_id, r.id, r.allegato_path, r.allegato_nome, r.created_by, r.created_at
from compliance_rinnovi r
where r.allegato_path is not null
  and not exists (select 1 from compliance_allegati a where a.path = r.allegato_path);


-- ------------------------------------------------------------
-- 4. Vista aggiornata — conteggio allegati al posto del singolo file
-- ------------------------------------------------------------
-- Rimuove ultimo_allegato_path/nome (non usati dalla UI) ed espone
-- ultimo_rinnovo_allegati (numero allegati dell'ultimo rinnovo).
-- Serve drop+create: con CREATE OR REPLACE non si possono togliere colonne.
drop view if exists v_compliance_scadenziario;
create view v_compliance_scadenziario
with (security_invoker = true) as
with ultimo_rinnovo as (
  select distinct on (adempimento_id)
    adempimento_id,
    id as rinnovo_id,
    data_rinnovo,
    data_scadenza_calcolata,
    costo,
    fornitore_id
  from compliance_rinnovi
  order by adempimento_id, data_rinnovo desc
),
conteggio_allegati as (
  select rinnovo_id, count(*)::int as n
  from compliance_allegati
  where rinnovo_id is not null
  group by rinnovo_id
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
  coalesce(ca.n, 0)          as ultimo_rinnovo_allegati,
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
left join conteggio_allegati ca on ca.rinnovo_id = ur.rinnovo_id
where a.attivo = true and a.deleted_at is null;
