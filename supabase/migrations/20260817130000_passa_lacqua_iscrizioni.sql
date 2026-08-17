-- ============================================================
-- Passa l'Acqua — iscrizioni dalla pagina pubblica
--
-- La pagina /passa-lacqua è pubblica: chi la usa NON ha un account
-- (ruolo Supabase "anon"). Le richieste che arrivano da lì NON
-- toccano la griglia dei 144 turni (staffetta_prenotazioni): sono
-- preferenze. Un turno con richieste pendenti resta libero finché
-- l'organizzazione non inserisce la prenotazione vera.
--
-- MODELLO DI SICUREZZA
--   - anon non ha NESSUNA policy su queste tabelle né su quelle
--     della staffetta: non legge e non scrive direttamente.
--   - può solo eseguire due funzioni SECURITY DEFINER:
--       passa_lacqua_turni()   → disponibilità, senza nomi
--       passa_lacqua_iscrivi() → invio del modulo (upsert)
--     Così nomi e telefoni non sono mai esponibili via API, e
--     l'aggiornamento per telefono non richiede di dare UPDATE
--     ad anon (che permetterebbe di sovrascrivere righe altrui
--     a piacere).
--
-- CONTRATTO "HH:MM"
--   passa_lacqua_turni() restituisce anche l'ora come 'HH24:MI'.
--   Quell'etichetta identifica un turno in modo univoco SOLO
--   perché l'evento dura esattamente 24 ore: 144 turni da 10
--   minuti coprono ogni HH:MM del giorno una volta sola. Se un
--   domani l'evento durasse di più (o i turni cambiassero durata)
--   l'ora smetterebbe di essere una chiave: usare slot_id, che
--   resta l'identificatore vero.
-- ============================================================

-- ---- tabelle -----------------------------------------------

create table if not exists public.passa_lacqua_iscrizioni (
  id                 uuid primary key default gen_random_uuid(),
  nome_completo      text not null,
  telefono           text not null unique,      -- normalizzato +39…, chiave dell'upsert
  email              text,
  interessi          text[] not null default '{}',
  come_conosciuto    text,                      -- Instagram | Passaparola | Coworking | Altro
  partecipa          boolean not null default false,
  newsletter_consent boolean not null default false,
  privacy_consent_at timestamptz not null,      -- quando è stato dato, non un semplice sì/no
  stato              text not null default 'nuova',  -- nuova|contattata|confermata|annullata (fase 2)
  note_admin         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Turni PREFERITI: tabella figlia, non un array.
-- Niente unique su slot_id da solo: più persone possono preferire
-- lo stesso turno, le preferenze non bloccano nulla.
create table if not exists public.passa_lacqua_turni_richiesti (
  id            uuid primary key default gen_random_uuid(),
  iscrizione_id uuid not null references public.passa_lacqua_iscrizioni(id) on delete cascade,
  slot_id       uuid not null references public.staffetta_slots(id),
  created_at    timestamptz not null default now(),
  unique (iscrizione_id, slot_id)
);

create index if not exists passa_lacqua_turni_slot_idx
  on public.passa_lacqua_turni_richiesti(slot_id);
create index if not exists passa_lacqua_iscrizioni_stato_idx
  on public.passa_lacqua_iscrizioni(stato);

-- ---- RLS: nessun accesso diretto, per nessuno --------------
-- RLS attiva senza policy = tutto negato ad anon e authenticated
-- (authenticated qui include gli ospiti dell'app, che non devono
-- vedere i contatti altrui). In fase 1 le richieste si leggono da
-- Supabase Studio con il service_role, che bypassa la RLS.
-- In fase 2 si aggiungerà una policy di lettura per i soli admin.

alter table public.passa_lacqua_iscrizioni      enable row level security;
alter table public.passa_lacqua_turni_richiesti enable row level security;

-- ---- disponibilità turni -----------------------------------
-- Espone SOLO se un turno è occupato, mai da chi.

create or replace function public.passa_lacqua_turni()
returns table (slot_id uuid, inizio timestamptz, ora text, occupato boolean)
language sql
security definer
set search_path = public
stable
as $$
  select s.id,
         s.inizio,
         to_char(s.inizio at time zone 'Europe/Rome', 'HH24:MI'),
         exists (select 1 from public.staffetta_prenotazioni p where p.slot_id = s.id)
  from public.staffetta_slots s
  order by s.inizio
$$;

-- ---- invio del modulo --------------------------------------
-- Upsert per telefono: chi reinvia aggiorna la propria riga invece
-- di crearne una seconda. Non restituisce mai i dati esistenti,
-- quindi la tabella non è leggibile né enumerabile dall'esterno.

create or replace function public.passa_lacqua_iscrivi(
  p_nome            text,
  p_telefono        text,
  p_email           text    default null,
  p_interessi       text[]  default '{}',
  p_come_conosciuto text    default null,
  p_partecipa       boolean default false,
  p_slot_ids        uuid[]  default '{}',
  p_newsletter      boolean default false,
  p_privacy         boolean default false,
  p_honeypot        text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_tel text;
begin
  -- honeypot: campo esca invisibile agli umani. Se è pieno è un bot:
  -- rispondiamo "ok" senza scrivere, così non capisce di essere stato
  -- scartato e non riprova con un'altra tecnica.
  if coalesce(trim(p_honeypot), '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome mancante' using errcode = '22023';
  end if;

  -- il client normalizza con normalizePhone(); qui si ricontrolla,
  -- perché una funzione pubblica non può fidarsi del chiamante
  v_tel := trim(coalesce(p_telefono, ''));
  if v_tel !~ '^\+\d{9,15}$' then
    raise exception 'telefono non valido' using errcode = '22023';
  end if;

  if not coalesce(p_privacy, false) then
    raise exception 'consenso privacy obbligatorio' using errcode = '22023';
  end if;

  insert into public.passa_lacqua_iscrizioni as i (
    nome_completo, telefono, email, interessi, come_conosciuto,
    partecipa, newsletter_consent, privacy_consent_at
  ) values (
    trim(p_nome),
    v_tel,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(p_interessi, '{}'),
    nullif(trim(coalesce(p_come_conosciuto, '')), ''),
    coalesce(p_partecipa, false),
    coalesce(p_newsletter, false),
    now()
  )
  on conflict (telefono) do update set
    nome_completo      = excluded.nome_completo,
    email              = excluded.email,
    interessi          = excluded.interessi,
    come_conosciuto    = excluded.come_conosciuto,
    partecipa          = excluded.partecipa,
    newsletter_consent = excluded.newsletter_consent,
    privacy_consent_at = excluded.privacy_consent_at,
    updated_at         = now()
    -- stato e note_admin NON si toccano: il lavoro dell'organizzazione
    -- non deve essere azzerato da un reinvio del modulo
  returning i.id into v_id;

  -- i turni preferiti si sostituiscono in blocco: l'ultimo invio vince
  delete from public.passa_lacqua_turni_richiesti where iscrizione_id = v_id;

  if coalesce(p_partecipa, false) and coalesce(array_length(p_slot_ids, 1), 0) > 0 then
    insert into public.passa_lacqua_turni_richiesti (iscrizione_id, slot_id)
    select v_id, s.id
    from public.staffetta_slots s
    where s.id = any(p_slot_ids)   -- il join scarta id inventati
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- ---- permessi ----------------------------------------------

revoke all on function public.passa_lacqua_turni() from public;
revoke all on function public.passa_lacqua_iscrivi(
  text, text, text, text[], text, boolean, uuid[], boolean, boolean, text
) from public;

grant execute on function public.passa_lacqua_turni() to anon, authenticated;
grant execute on function public.passa_lacqua_iscrivi(
  text, text, text, text[], text, boolean, uuid[], boolean, boolean, text
) to anon, authenticated;
