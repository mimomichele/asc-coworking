-- ============================================================
-- Preventivi: traccia della conversazione email
--
-- Una riga per ogni messaggio del thread Gmail della richiesta,
-- in entrata (cliente) o in uscita (reception). Popolata dalla Edge
-- Function preventivi-sync-thread, chiamata dallo scenario Make
-- "Sync conversazioni Gmail" (daily 06:15 + bottone in app).
--
-- Sulla richiesta teniamo i contatori e l'ultimo messaggio, da cui
-- il frontend ricava la fase: prima risposta inviata / conversazione
-- in corso / il cliente ha risposto (da leggere).
-- ============================================================

create table if not exists public.richieste_messaggi (
  id                uuid primary key default gen_random_uuid(),
  richiesta_id      uuid not null references public.richieste_preventivo(id) on delete cascade,
  gmail_message_id  text not null unique,
  gmail_thread_id   text,
  direzione         text not null check (direzione in ('in','out')),
  from_email        citext,
  from_name         text,
  subject           text,
  testo             text,     -- corpo pulito dalle citazioni delle reply
  snippet           text,
  data              timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists richieste_messaggi_richiesta_idx
  on public.richieste_messaggi(richiesta_id, data);

alter table public.richieste_preventivo
  add column if not exists ultimo_msg_direzione text
    check (ultimo_msg_direzione in ('in','out')),
  add column if not exists ultimo_msg_at timestamptz,
  add column if not exists n_msg_in  int not null default 0,
  add column if not exists n_msg_out int not null default 0;

-- Solo lettura dall'app: scrive la Edge Function col service role.
alter table public.richieste_messaggi enable row level security;

drop policy if exists "messaggi admin select" on public.richieste_messaggi;
create policy "messaggi admin select" on public.richieste_messaggi
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- La scheda richiesta si aggiorna da sola quando arrivano messaggi.
alter publication supabase_realtime add table public.richieste_messaggi;
