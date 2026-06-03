-- ============================================================
-- Migration: Turni FASE 2 — login dipendenti + RLS "own row"
-- ============================================================
-- Abilita l'accesso self-service dei dipendenti (ruolo
-- 'dipendente', collegati via dipendenti.profile_id = auth.uid()).
--
-- Le policy admin-full di Fase 1 restano intatte: qui AGGIUNGIAMO
-- solo le policy "own row" per i dipendenti. Punto critico: dati
-- sanitari (certificati di malattia) → un dipendente non deve mai
-- poter leggere/scrivere dati di un altro.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Ruolo 'dipendente' ammesso in profiles.role
-- ------------------------------------------------------------
-- Lo schema iniziale aveva check (role in ('admin','guest')); in DB
-- e' poi stato aggiunto 'rosticceria'. Riallineiamo il vincolo in modo
-- idempotente includendo tutti i ruoli in uso + 'dipendente'.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin','guest','rosticceria','dipendente'));


-- ------------------------------------------------------------
-- 2. dipendenti.username (copia denormalizzata per display admin)
-- ------------------------------------------------------------
-- Lo username di login vive in profiles.username; lo duplichiamo qui
-- per mostrarlo nella schermata admin senza dover leggere le righe
-- profiles di altri utenti (evita dipendenze da policy profiles).
alter table dipendenti add column if not exists username text;


-- ------------------------------------------------------------
-- 3. Helper: id del dipendente collegato all'utente corrente
-- ------------------------------------------------------------
-- SECURITY DEFINER → la lettura di `dipendenti` nella funzione bypassa
-- la RLS, evitando problemi di visibilita'/ricorsione quando la usiamo
-- dentro le policy delle altre tabelle.
create or replace function current_dipendente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from dipendenti where profile_id = auth.uid() limit 1
$$;


-- ------------------------------------------------------------
-- 4. Policy "own row" per i dipendenti
-- ------------------------------------------------------------

-- dipendenti: il dipendente legge SOLO il proprio record.
create policy "dipendenti_self_read" on dipendenti
  for select to authenticated
  using (profile_id = auth.uid());

-- shifts: il dipendente legge SOLO i propri turni. Nessuna scrittura.
create policy "shifts_dip_read" on shifts
  for select to authenticated
  using (dipendente_id = current_dipendente_id());

-- shift_change_requests: legge le proprie; le crea forzando stato='pending'
-- (non puo' auto-approvarsi). Nessun update: l'approvazione la fa l'admin.
create policy "scr_dip_read" on shift_change_requests
  for select to authenticated
  using (dipendente_id = current_dipendente_id());

create policy "scr_dip_insert" on shift_change_requests
  for insert to authenticated
  with check (
    dipendente_id = current_dipendente_id()
    and stato = 'pending'
  );

-- leave_requests: legge le proprie; le crea con vincolo type/stato anti-abuso:
--   ferie    → sempre 'pending' (richiede approvazione admin)
--   malattia → 'approved' diretta, ma SOLO con certificato allegato
-- Nessun update: lo stato lo cambia solo l'admin (per le ferie).
create policy "leave_dip_read" on leave_requests
  for select to authenticated
  using (dipendente_id = current_dipendente_id());

create policy "leave_dip_insert" on leave_requests
  for insert to authenticated
  with check (
    dipendente_id = current_dipendente_id()
    and (
      (type = 'ferie'    and stato = 'pending')
      or (type = 'malattia' and stato = 'approved' and certificate_url is not null)
    )
  );


-- ------------------------------------------------------------
-- 5. Storage: bucket privato 'certificati' — accesso dipendente
-- ------------------------------------------------------------
-- In aggiunta a cert_admin_read (Fase 1, admin legge tutto), il
-- dipendente puo' caricare (INSERT) e leggere (SELECT) SOLO i file
-- nella propria cartella: cert/<proprio dipendente_id>/...
-- foldername(name) = ['cert', '<dipendente_id>', ...].
create policy "cert_dip_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificati'
    and (storage.foldername(name))[1] = 'cert'
    and (storage.foldername(name))[2] = current_dipendente_id()::text
  );

create policy "cert_dip_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificati'
    and (storage.foldername(name))[1] = 'cert'
    and (storage.foldername(name))[2] = current_dipendente_id()::text
  );
