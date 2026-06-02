-- ============================================================
-- Migration: Contratto di membership — firma obbligatoria al
-- primo accesso (ruolo guest). Schema, RLS, estensione members.
-- ============================================================
-- - Tabella `contracts`: una sola riga con il testo del contratto.
--   Niente versioning. Il testo e' un TEMPLATE con placeholder
--   {{NOME_COGNOME}}, {{LUOGO_NASCITA}}, {{DATA_NASCITA}},
--   {{RESIDENZA}}, {{CODICE_FISCALE}}, {{NUMERO_DOCUMENTO}},
--   {{DATA_FIRMA}}. La Edge Function `sign-contract` (Fase 2)
--   sostituisce i placeholder con i dati reali quando genera il PDF.
--
-- - Tabella `contract_signatures`: una riga per ogni firma di
--   un ospite. INSERT solo via Edge Function (service role bypassa
--   RLS), mai dal client.
--
-- - Estensione `members`: 3 colonne nuove per i dati anagrafici
--   raccolti dal form di firma. Le altre 3 (`data_nascita`,
--   `numero_documento`, `name`/`surname` da accounts) gia' esistono.
--
-- - Bucket Storage `contract-signatures`: da creare a parte dalla
--   dashboard (vedi istruzioni nel messaggio di chat). Le policy
--   storage qui sotto si possono applicare anche prima della
--   creazione del bucket; agiscono solo quando ci sono oggetti
--   in quel bucket.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tabella contracts (una sola riga, il "main contract")
-- ------------------------------------------------------------
create table if not exists contracts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  updated_at  timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2. Tabella contract_signatures
-- ------------------------------------------------------------
-- Niente UNIQUE su user_id: lasciamo possibile la re-firma in futuro
-- (es. se il contratto cambia in modo materiale). L'app considera
-- l'ospite "firmato" se esiste >= 1 riga per user_id.
-- pdf_path NOT NULL: ogni firma ha sempre un PDF associato perche'
-- la Edge Function fa l'insert SOLO dopo aver caricato il file.
create table if not exists contract_signatures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  signed_at   timestamptz not null default now(),
  ip          text,
  user_agent  text,
  pdf_path    text not null
);

create index if not exists idx_sig_user on contract_signatures (user_id);


-- ------------------------------------------------------------
-- 3. Estensione members per i dati raccolti dal form di firma.
-- ------------------------------------------------------------
-- Niente CHECK regex su codice_fiscale: i CF stranieri/temporanei
-- hanno formato diverso e bloccherebbero la firma. Validazione del
-- formato italiano resta lato client + Edge Function.
alter table members add column if not exists luogo_nascita_testo text;
alter table members add column if not exists residenza           text;
alter table members add column if not exists codice_fiscale      text;


-- ------------------------------------------------------------
-- 4. RLS — tabelle DB
-- ------------------------------------------------------------
alter table contracts           enable row level security;
alter table contract_signatures enable row level security;

-- contracts: lettura per qualunque autenticato (il guest deve leggere
-- il body per mostrarlo nella schermata di firma). Scrittura solo
-- admin (o via SQL Editor con service role).
create policy "contracts_read_authenticated" on contracts
  for select to authenticated using (true);

create policy "contracts_admin_write" on contracts
  for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- contract_signatures: il guest legge le proprie firme, l'admin
-- legge tutto. INSERT/UPDATE/DELETE solo via Edge Function con
-- service role (bypassa RLS).
create policy "sig_own_read" on contract_signatures
  for select to authenticated using (user_id = auth.uid());

create policy "sig_admin_read" on contract_signatures
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));


-- ------------------------------------------------------------
-- 5. RLS — storage.objects per il bucket 'contract-signatures'
-- ------------------------------------------------------------
-- Path scheme: 'sig/<user_id>/<signature_id>.pdf'
--   - guest: legge SOLO i PDF nella sottocartella che inizia col
--     proprio user_id;
--   - admin: legge tutto.
-- Upload: NESSUNA policy → solo Edge Function con service role
-- puo' scrivere nel bucket.

create policy "sig_pdf_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sig_pdf_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-signatures'
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
