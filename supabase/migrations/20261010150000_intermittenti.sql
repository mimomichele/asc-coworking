-- ============================================================
-- Migration: comunicazioni obbligatorie lavoratori intermittenti
-- (contratto a chiamata) — modello ministeriale ML-15-01.
-- ============================================================
-- Un lavoratore con dipendenti.a_chiamata = true deve essere
-- comunicato al Ministero PRIMA di ogni giornata di lavoro.
-- Lo stato della comunicazione vive sul turno (shifts.com_stato):
--   null            lavoratore non a chiamata
--   da_comunicare   turno inserito/spostato, non ancora inviato
--   comunicato      inviato; com_inizio/com_fine = date della riga
--                   del modulo con cui e' stato comunicato
-- Gli ANNULLAMENTI da inviare stanno in intermittenti_annullamenti
-- (un turno comunicato poi cancellato o spostato non esiste piu' in
-- shifts, quindi la memoria va tenuta a parte). Il modulo annulla
-- SEMPRE la riga originale per intero: se di una riga 10-12 si toglie
-- l'11, la riga 10-12 va annullata e il 10 e il 12 tornano da
-- comunicare. Lo fa la funzione intermittenti_apri_annullamento.
-- Tutta la logica e' in trigger, cosi' vale per ogni punto dell'app
-- che scrive turni (popover, copia settimana, richieste, mensile).
-- Il registro degli invii e' intermittenti_invii.
-- Idempotente: si puo' rilanciare.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Anagrafica: flag a chiamata + codici obbligatori
-- ------------------------------------------------------------
alter table dipendenti add column if not exists a_chiamata boolean not null default false;
alter table dipendenti add column if not exists codice_fiscale text;
alter table dipendenti add column if not exists codice_comunicazione text;

alter table dipendenti drop constraint if exists dipendenti_a_chiamata_codici;
alter table dipendenti add constraint dipendenti_a_chiamata_codici
  check (
    not a_chiamata
    or (
      coalesce(codice_fiscale, '') <> ''
      and coalesce(codice_comunicazione, '') <> ''
    )
  );


-- ------------------------------------------------------------
-- 2. Registro invii
-- ------------------------------------------------------------
create table if not exists intermittenti_invii (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  admin_id      uuid references auth.users(id) on delete set null,
  admin_email   text,
  tipo          text not null check (tipo in ('comunicazione','annullamento')),
  righe         jsonb not null default '[]'::jsonb,
  xml           text not null,
  destinatario  text,
  prova         boolean not null default false,
  esito         text not null check (esito in ('inviato','errore')),
  errore        text
);
create index if not exists idx_intermittenti_invii_created on intermittenti_invii (created_at desc);


-- ------------------------------------------------------------
-- 3. Stato di comunicazione sul turno
-- ------------------------------------------------------------
alter table shifts add column if not exists com_stato text
  check (com_stato in ('da_comunicare','comunicato'));
alter table shifts add column if not exists com_inizio   date;
alter table shifts add column if not exists com_fine     date;
alter table shifts add column if not exists com_invio_id uuid references intermittenti_invii(id) on delete set null;
create index if not exists idx_shifts_com_stato on shifts (com_stato) where com_stato is not null;


-- ------------------------------------------------------------
-- 4. Annullamenti da inviare (snapshot dei dati del lavoratore,
--    cosi' l'annullamento parte anche se il dipendente viene eliminato)
-- ------------------------------------------------------------
create table if not exists intermittenti_annullamenti (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  dipendente_id         uuid references dipendenti(id) on delete set null,
  nome                  text,
  codice_fiscale        text not null,
  codice_comunicazione  text not null,
  inizio                date not null,
  fine                  date not null,
  motivo                text,
  invio_originale_id    uuid references intermittenti_invii(id) on delete set null,
  stato                 text not null default 'da_inviare' check (stato in ('da_inviare','inviato')),
  invio_id              uuid references intermittenti_invii(id) on delete set null,
  inviato_at            timestamptz
);
create index if not exists idx_intermittenti_ann_stato on intermittenti_annullamenti (stato);


-- ------------------------------------------------------------
-- 5. Funzione: apre un annullamento per una riga comunicata e
--    rimette da comunicare gli altri turni della stessa riga
-- ------------------------------------------------------------
create or replace function intermittenti_apri_annullamento(
  p_dipendente uuid, p_inizio date, p_fine date, p_invio uuid, p_motivo text, p_escludi_shift uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if p_inizio is null or p_fine is null then return; end if;

  select id, nome, cognome, codice_fiscale, codice_comunicazione
    into d from dipendenti where id = p_dipendente;

  if not exists (
    select 1 from intermittenti_annullamenti
     where stato = 'da_inviare'
       and codice_fiscale = coalesce(d.codice_fiscale, '')
       and inizio = p_inizio and fine = p_fine
  ) then
    insert into intermittenti_annullamenti
      (dipendente_id, nome, codice_fiscale, codice_comunicazione, inizio, fine, motivo, invio_originale_id)
    values
      (d.id, trim(coalesce(d.nome, '') || ' ' || coalesce(d.cognome, '')),
       coalesce(d.codice_fiscale, ''), coalesce(d.codice_comunicazione, ''),
       p_inizio, p_fine, p_motivo, p_invio);
  end if;

  -- gli altri giorni della stessa riga vanno ricomunicati
  update shifts
     set com_stato = 'da_comunicare', com_inizio = null, com_fine = null, com_invio_id = null
   where dipendente_id = p_dipendente
     and com_stato = 'comunicato'
     and com_inizio = p_inizio and com_fine = p_fine
     and (p_escludi_shift is null or id <> p_escludi_shift);
end;
$$;


-- ------------------------------------------------------------
-- 6. Trigger su shifts
-- ------------------------------------------------------------
-- INSERT: lavoratore a chiamata -> da_comunicare, salvo che lo stesso
-- giorno sia gia' comunicato (turno spezzato): allora eredita la riga.
create or replace function intermittenti_shift_insert() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chiamata boolean;
  r record;
begin
  select a_chiamata into v_chiamata from dipendenti where id = new.dipendente_id;
  if not coalesce(v_chiamata, false) then
    new.com_stato := null; new.com_inizio := null; new.com_fine := null; new.com_invio_id := null;
    return new;
  end if;
  select com_inizio, com_fine, com_invio_id into r
    from shifts
   where dipendente_id = new.dipendente_id and data = new.data and com_stato = 'comunicato'
   limit 1;
  if found then
    new.com_stato := 'comunicato'; new.com_inizio := r.com_inizio; new.com_fine := r.com_fine; new.com_invio_id := r.com_invio_id;
  else
    new.com_stato := 'da_comunicare'; new.com_inizio := null; new.com_fine := null; new.com_invio_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_intermittenti_shift_insert on shifts;
create trigger trg_intermittenti_shift_insert
  before insert on shifts
  for each row execute function intermittenti_shift_insert();


-- UPDATE della data: la data vecchia, se comunicata e rimasta scoperta,
-- apre un annullamento; la data nuova si comporta come un inserimento.
-- Un cambio di solo orario non passa di qui (il modulo ha solo le date).
create or replace function intermittenti_shift_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chiamata boolean;
  r record;
begin
  if old.com_stato = 'comunicato' and not exists (
    select 1 from shifts
     where id <> old.id and dipendente_id = old.dipendente_id and data = old.data and com_stato = 'comunicato'
  ) then
    perform intermittenti_apri_annullamento(old.dipendente_id, old.com_inizio, old.com_fine, old.com_invio_id, 'turno spostato', old.id);
  end if;

  select a_chiamata into v_chiamata from dipendenti where id = new.dipendente_id;
  if not coalesce(v_chiamata, false) then
    new.com_stato := null; new.com_inizio := null; new.com_fine := null; new.com_invio_id := null;
    return new;
  end if;
  select com_inizio, com_fine, com_invio_id into r
    from shifts
   where id <> new.id and dipendente_id = new.dipendente_id and data = new.data and com_stato = 'comunicato'
   limit 1;
  if found then
    new.com_stato := 'comunicato'; new.com_inizio := r.com_inizio; new.com_fine := r.com_fine; new.com_invio_id := r.com_invio_id;
  else
    new.com_stato := 'da_comunicare'; new.com_inizio := null; new.com_fine := null; new.com_invio_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_intermittenti_shift_update on shifts;
create trigger trg_intermittenti_shift_update
  before update of data, dipendente_id on shifts
  for each row
  when (old.data is distinct from new.data or old.dipendente_id is distinct from new.dipendente_id)
  execute function intermittenti_shift_update();


-- DELETE: un turno comunicato cancellato apre un annullamento, a meno
-- che lo stesso giorno resti coperto da un altro turno comunicato.
create or replace function intermittenti_shift_delete() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.com_stato = 'comunicato' and not exists (
    select 1 from shifts
     where id <> old.id and dipendente_id = old.dipendente_id and data = old.data and com_stato = 'comunicato'
  ) then
    perform intermittenti_apri_annullamento(old.dipendente_id, old.com_inizio, old.com_fine, old.com_invio_id, 'turno cancellato', old.id);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_intermittenti_shift_delete on shifts;
create trigger trg_intermittenti_shift_delete
  before delete on shifts
  for each row execute function intermittenti_shift_delete();


-- ------------------------------------------------------------
-- 7. Trigger su dipendenti: accendere il flag mette da comunicare i
--    turni futuri gia' inseriti; spegnerlo pulisce quelli non inviati.
-- ------------------------------------------------------------
create or replace function intermittenti_dipendente_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.a_chiamata and not old.a_chiamata then
    update shifts set com_stato = 'da_comunicare'
     where dipendente_id = new.id and data >= current_date and com_stato is null;
  elsif old.a_chiamata and not new.a_chiamata then
    update shifts set com_stato = null, com_inizio = null, com_fine = null, com_invio_id = null
     where dipendente_id = new.id and com_stato = 'da_comunicare';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_intermittenti_dipendente_update on dipendenti;
create trigger trg_intermittenti_dipendente_update
  after update of a_chiamata on dipendenti
  for each row execute function intermittenti_dipendente_update();


-- Eliminazione di un lavoratore a chiamata: le giornate gia' comunicate
-- vanno annullate. Si apre l'annullamento PRIMA che la riga sparisca
-- (cosi' lo snapshot nome/codici e' completo); i turni vengono poi
-- cancellati dal cascade senza aprire doppioni.
create or replace function intermittenti_dipendente_delete() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.a_chiamata then
    perform intermittenti_apri_annullamento(old.id, s.com_inizio, s.com_fine, s.com_invio_id, 'lavoratore eliminato', null)
      from (
        select distinct com_inizio, com_fine, com_invio_id
          from shifts
         where dipendente_id = old.id and com_stato = 'comunicato'
      ) s;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_intermittenti_dipendente_delete on dipendenti;
create trigger trg_intermittenti_dipendente_delete
  before delete on dipendenti
  for each row execute function intermittenti_dipendente_delete();


-- ------------------------------------------------------------
-- 8. RLS: solo admin (stesso pattern delle altre tabelle turni)
-- ------------------------------------------------------------
alter table intermittenti_invii         enable row level security;
alter table intermittenti_annullamenti  enable row level security;

drop policy if exists "admin_all_intermittenti_invii" on intermittenti_invii;
create policy "admin_all_intermittenti_invii" on intermittenti_invii for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admin_all_intermittenti_annullamenti" on intermittenti_annullamenti;
create policy "admin_all_intermittenti_annullamenti" on intermittenti_annullamenti for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
