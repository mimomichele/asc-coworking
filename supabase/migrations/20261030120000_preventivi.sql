-- ============================================================
-- Migration: Admin Preventivi
--
-- Nuova sezione admin per gestire le richieste di preventivo
-- (raduni/gruppi sportivi, gruppi scolastici, famiglie/singoli).
-- Non tocca il modello coworking: `contatti` e' una rubrica a se,
-- con un collegamento OPZIONALE a `members` quando reception
-- riconosce che e' una stessa persona (vedi scheda contatto).
--
-- Cinque tabelle:
--   contatti                  rubrica richiedenti
--   richieste_preventivo      la richiesta vera
--   richieste_eventi          log immutabile (cambi stato, note, follow-up)
--   template_risposta         un template per tipologia (modificabile)
--   preventivi_impostazioni   singoli valori di configurazione (soglie)
--
-- Automatismi (BEFORE UPDATE):
--   - data_invio: alla prima transizione a 'inviato'
--   - data_chiusura: a 'confermata' | 'persa' | 'scaduta'
--   - updated_at: su ogni UPDATE
--   - log 'cambio_stato' in richieste_eventi
--   - guard: 'confermata' richiede krossbooking_ref,
--            'persa' richiede motivo_perdita
--
-- RLS: tutto riservato a profiles.role = 'admin' (pattern di
-- progetto). Allineato a passa_lacqua_admin_policies.sql.
-- ============================================================

-- citext per email case-insensitive. Il pattern upsert per
-- email/telefono funziona meglio se la colonna e' citext.
create extension if not exists citext;

-- ---- enum tipi -----------------------------------------------

do $$ begin
  create type preventivo_tipologia as enum ('raduno', 'scuola', 'famiglia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type preventivo_canale as enum (
    'telefono','email','whatsapp','sito','reception','federazione','altro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type preventivo_stato as enum (
    'ricevuta','inviato','attesa','confermata','persa','scaduta'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type preventivo_motivo_perdita as enum (
    'prezzo','date_non_disponibili','nessuna_risposta','scelto_altro','altro'
  );
exception when duplicate_object then null; end $$;

-- ---- helper: normalizza telefono per dedup -------------------
-- Tiene solo cifre e il "+" iniziale; se non c'e' prefisso lo
-- aggiunge come "+39" (default IT). Non valida la lunghezza:
-- la rubrica accetta anche cellulari esteri di gruppi scuola.

create or replace function public.preventivi_norm_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or trim(raw) = '' then null
    when trim(raw) like '+%'
      then '+' || regexp_replace(trim(raw), '\D', '', 'g')
    else '+39' || regexp_replace(trim(raw), '\D', '', 'g')
  end
$$;

-- ---- tabelle -------------------------------------------------

create table if not exists public.contatti (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null,
  cognome                  text,
  societa_ente             text,
  email                    citext,
  telefono                 text,
  telefono_norm            text generated always as (public.preventivi_norm_phone(telefono)) stored,
  member_id                uuid references public.members(id) on delete set null,
  consenso_marketing       boolean not null default false,
  consenso_marketing_data  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint contatti_contact_point_check
    check (email is not null or telefono is not null)
);

-- Indici unique PARZIALI: una stessa email o telefono non puo'
-- esistere due volte, ma le righe senza email/telefono (una delle
-- due colonne nulla) non confliggono tra loro.
create unique index if not exists contatti_email_unique
  on public.contatti (email) where email is not null;
create unique index if not exists contatti_telefono_unique
  on public.contatti (telefono_norm) where telefono_norm is not null;

create index if not exists contatti_member_id_idx
  on public.contatti(member_id) where member_id is not null;

-- -- richieste_preventivo --------------------------------------

create table if not exists public.richieste_preventivo (
  id                           uuid primary key default gen_random_uuid(),
  contatto_id                  uuid not null references public.contatti(id) on delete restrict,
  tipologia                    preventivo_tipologia not null,
  canale                       preventivo_canale not null,
  data_arrivo                  date,
  data_partenza                date,
  periodo_note                 text,
  n_persone                    int,
  n_accompagnatori             int,
  servizi                      text[] not null default '{}',
  note                         text,
  stato                        preventivo_stato not null default 'ricevuta',
  motivo_perdita               preventivo_motivo_perdita,
  motivo_perdita_note          text,
  importo_preventivo           numeric(10,2),
  krossbooking_ref             text,
  email_origine_id             text,
  email_origine_testo          text,
  email_origine_link           text,
  bozza_risposta               text,
  operatore_presa_in_carico    uuid references auth.users(id),
  operatore_invio              uuid references auth.users(id),
  data_ricevuta                timestamptz not null default now(),
  data_invio                   timestamptz,
  data_ultimo_contatto         timestamptz,
  data_chiusura                timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  -- Servizi: solo chiavi previste (array validato).
  constraint richieste_servizi_check
    check (servizi <@ array['pernottamento','pasti','piscina','campi','altro']::text[]),

  -- 'persa' richiede un motivo.
  constraint richieste_persa_motivo_check
    check (stato <> 'persa' or motivo_perdita is not null),

  -- 'confermata' richiede il riferimento Krossbooking.
  constraint richieste_confermata_ref_check
    check (stato <> 'confermata' or coalesce(trim(krossbooking_ref), '') <> ''),

  -- Date coerenti se entrambe presenti.
  constraint richieste_date_check
    check (data_partenza is null or data_arrivo is null or data_partenza >= data_arrivo)
);

create index if not exists richieste_stato_idx     on public.richieste_preventivo(stato);
create index if not exists richieste_contatto_idx  on public.richieste_preventivo(contatto_id);
create index if not exists richieste_tipologia_idx on public.richieste_preventivo(tipologia);
create index if not exists richieste_data_arrivo_idx on public.richieste_preventivo(data_arrivo);
create index if not exists richieste_data_invio_idx on public.richieste_preventivo(data_invio);

-- -- log eventi -----------------------------------------------

create table if not exists public.richieste_eventi (
  id            uuid primary key default gen_random_uuid(),
  richiesta_id  uuid not null references public.richieste_preventivo(id) on delete cascade,
  utente_id     uuid references auth.users(id),
  tipo          text not null,
  da_stato      preventivo_stato,
  a_stato       preventivo_stato,
  testo         text,
  created_at    timestamptz not null default now(),
  constraint richieste_eventi_tipo_check
    check (tipo in ('cambio_stato','nota','follow_up','rigenera_bozza','email_import','ricontattato'))
);

create index if not exists richieste_eventi_richiesta_idx
  on public.richieste_eventi(richiesta_id, created_at desc);

-- -- template -------------------------------------------------
-- Un solo template per tipologia (unique sulla enum). Editabili
-- dall'app in Impostazioni. I segnaposto reali ([NOME], [DATE],
-- [PREZZO notte], ...) vengono sostituiti lato Edge Function
-- quando genera la bozza di risposta.

create table if not exists public.template_risposta (
  id               uuid primary key default gen_random_uuid(),
  tipologia        preventivo_tipologia not null unique,
  oggetto_template text not null,
  corpo_template   text not null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id)
);

-- -- impostazioni --------------------------------------------
-- Singleton key/value. Chiavi previste:
--   'follow_up_giorni'  -> {raduno:7, scuola:14, famiglia:3}
--   Nessun hardcode: la Edge Function cron e la UI leggono da qui.

create table if not exists public.preventivi_impostazioni (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---- trigger: updated_at --------------------------------------

create or replace function public.preventivi_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_contatti_updated_at on public.contatti;
create trigger trg_contatti_updated_at
  before update on public.contatti
  for each row execute function public.preventivi_set_updated_at();

drop trigger if exists trg_richieste_updated_at on public.richieste_preventivo;
create trigger trg_richieste_updated_at
  before update on public.richieste_preventivo
  for each row execute function public.preventivi_set_updated_at();

drop trigger if exists trg_template_updated_at on public.template_risposta;
create trigger trg_template_updated_at
  before update on public.template_risposta
  for each row execute function public.preventivi_set_updated_at();

-- ---- trigger: date automatiche al cambio stato ---------------
-- - entrando in 'inviato' per la prima volta: data_invio = now()
-- - entrando in uno stato finale: data_chiusura = now()
-- - uscendo da uno stato finale (reset): data_chiusura = null
-- Non sovrascrive date gia' impostate, cosi' un operatore puo'
-- correggere manualmente la data_invio in casi anomali.

create or replace function public.richieste_stato_dates()
returns trigger
language plpgsql
as $$
begin
  if new.stato is distinct from old.stato then
    if new.stato = 'inviato' and new.data_invio is null then
      new.data_invio := now();
    end if;
    if new.stato in ('confermata','persa','scaduta') and new.data_chiusura is null then
      new.data_chiusura := now();
    end if;
    if old.stato in ('confermata','persa','scaduta')
       and new.stato not in ('confermata','persa','scaduta') then
      new.data_chiusura := null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_richieste_stato_dates on public.richieste_preventivo;
create trigger trg_richieste_stato_dates
  before update on public.richieste_preventivo
  for each row execute function public.richieste_stato_dates();

-- ---- trigger: log cambi di stato -----------------------------
-- Scrive una riga 'cambio_stato' in richieste_eventi a ogni
-- transizione. utente_id viene da auth.uid() se disponibile.

create or replace function public.richieste_log_stato()
returns trigger
language plpgsql
as $$
begin
  if new.stato is distinct from old.stato then
    insert into public.richieste_eventi (richiesta_id, utente_id, tipo, da_stato, a_stato)
    values (new.id, auth.uid(), 'cambio_stato', old.stato, new.stato);
  end if;
  return new;
end
$$;

drop trigger if exists trg_richieste_log_stato on public.richieste_preventivo;
create trigger trg_richieste_log_stato
  after update on public.richieste_preventivo
  for each row execute function public.richieste_log_stato();

-- ---- RLS ----------------------------------------------------
-- Solo utenti con profiles.role = 'admin'. Pattern identico a
-- passa_lacqua_admin_policies.sql / turni / compliance.

alter table public.contatti                enable row level security;
alter table public.richieste_preventivo    enable row level security;
alter table public.richieste_eventi        enable row level security;
alter table public.template_risposta       enable row level security;
alter table public.preventivi_impostazioni enable row level security;

-- contatti
drop policy if exists "contatti admin all"      on public.contatti;
create policy "contatti admin all" on public.contatti
  for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- richieste_preventivo
drop policy if exists "richieste admin all"     on public.richieste_preventivo;
create policy "richieste admin all" on public.richieste_preventivo
  for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- richieste_eventi
drop policy if exists "eventi admin select"     on public.richieste_eventi;
create policy "eventi admin select" on public.richieste_eventi
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "eventi admin insert"     on public.richieste_eventi;
create policy "eventi admin insert" on public.richieste_eventi
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- NB: niente UPDATE/DELETE sul log. E' immutabile a vista d'admin.
-- Il trigger di cambio stato scrive aggirando la RLS (SECURITY DEFINER
-- non serve: le funzioni trigger girano col privilegio del chiamante
-- MA l'insert dal trigger passa comunque le policy; aggiungiamo la
-- policy insert per authenticated admin, che e' sempre il caso).

-- template_risposta
drop policy if exists "template admin all"      on public.template_risposta;
create policy "template admin all" on public.template_risposta
  for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- preventivi_impostazioni
drop policy if exists "impostazioni admin all"  on public.preventivi_impostazioni;
create policy "impostazioni admin all" on public.preventivi_impostazioni
  for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ---- seed: template segnaposto -------------------------------
-- Testi provvisori: li sostituira' l'utente da Impostazioni. Qui
-- servono solo a far funzionare "Rigenera bozza" dal primo giorno.

insert into public.template_risposta (tipologia, oggetto_template, corpo_template)
values
  ('raduno',
   'Preventivo ASC Hotel - raduno [NOME_GRUPPO] - [DATE]',
   'Buongiorno [NOME],

grazie per averci scritto per il raduno di [NOME_GRUPPO] a [DATE] ([N_PERSONE] persone, servizi richiesti: [SERVIZI]).

Possiamo proporre:
- pernottamento in camera doppia: [PREZZO notte] a persona
- pasto in sala: [PREZZO pasto] a persona
- accesso piscina: [PREZZO piscina]

Il preventivo e'' valido per [VALIDITA] giorni, bloccando la disponibilita'' delle camere al momento della conferma.

Resto a disposizione per ogni dettaglio.

Reception ASC Hotel'),

  ('scuola',
   'Preventivo ASC Hotel - gruppo scolastico [NOME_GRUPPO] - [DATE]',
   'Buongiorno [NOME],

grazie per la richiesta per il gruppo scolastico di [NOME_GRUPPO] in arrivo [DATE] ([N_PERSONE] studenti, [N_ACCOMPAGNATORI] accompagnatori).

Possiamo offrire:
- pernottamento in camera multipla: [PREZZO notte] per studente
- pasto in sala: [PREZZO pasto] a studente
- gratuita'' standard per accompagnatori: 1 ogni 15 studenti
- accesso piscina su richiesta: [PREZZO piscina]

Il preventivo e'' valido per [VALIDITA] giorni. Al momento della conferma blocchiamo la disponibilita'' delle camere e inviamo la rooming list.

Resto a disposizione per modifiche su durata, pasti e servizi.

Reception ASC Hotel'),

  ('famiglia',
   'Preventivo ASC Hotel - [COGNOME] - [DATE]',
   'Buongiorno [NOME],

grazie per averci scritto. Per il soggiorno di [N_PERSONE] persone dal [DATE]:

- camera: [PREZZO notte] a notte, colazione inclusa
- pasto in sala: [PREZZO pasto] a persona
- accesso piscina: [PREZZO piscina]

La tariffa comprende Wi-Fi, parcheggio e colazione. Fatemi sapere se preferite camera matrimoniale o doppia, e se vi serve una culla.

Il preventivo e'' valido per [VALIDITA] giorni.

Reception ASC Hotel')
on conflict (tipologia) do nothing;

-- ---- seed: soglie follow-up ---------------------------------
-- La UI legge/edita questa chiave in Impostazioni. Modificabile.

insert into public.preventivi_impostazioni (key, value)
values ('follow_up_giorni', '{"raduno": 7, "scuola": 14, "famiglia": 3}'::jsonb)
on conflict (key) do nothing;
