-- ============================================================
-- Passa l'Acqua — iscrizione agli EVENTI collaterali
--
-- Oltre ai turni della staffetta, dalla pagina pubblica ci si può
-- iscrivere agli eventi che lo richiedono:
--   letture    → Reading a bordo piscina (sab 19:30)
--   yoga       → Yoga all'alba (dom 6:30)
--   colazione  → Colazione Wellness (dom, dopo lo yoga)
-- Niente slot da scegliere: solo l'evento e in quanti si viene.
--
-- Stesso modello dei turni preferiti: tabella figlia con cascade,
-- RLS attiva, lettura solo admin, scrittura solo attraverso la
-- funzione SECURITY DEFINER passa_lacqua_iscrivi(). Le chiavi
-- evento sono vincolate da un CHECK: la funzione scarta in
-- silenzio tutto ciò che non riconosce (stessa filosofia del join
-- che scarta gli slot_id inventati).
-- ============================================================

-- ---- tabella -----------------------------------------------

create table if not exists public.passa_lacqua_eventi_richiesti (
  id            uuid primary key default gen_random_uuid(),
  iscrizione_id uuid not null references public.passa_lacqua_iscrizioni(id) on delete cascade,
  evento        text not null check (evento in ('letture', 'yoga', 'colazione')),
  persone       int  not null default 1 check (persone between 1 and 20),
  created_at    timestamptz not null default now(),
  unique (iscrizione_id, evento)
);

create index if not exists passa_lacqua_eventi_evento_idx
  on public.passa_lacqua_eventi_richiesti(evento);

-- RLS attiva; per anon e per gli ospiti authenticated nessuna
-- policy = nessun accesso diretto. Lettura solo admin, come per
-- i turni richiesti.
alter table public.passa_lacqua_eventi_richiesti enable row level security;

create policy pl_eventi_select_admin on public.passa_lacqua_eventi_richiesti
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ---- funzione di invio: nuova firma ------------------------
-- Aggiungere un parametro cambia la firma: CREATE OR REPLACE
-- creerebbe un OVERLOAD lasciando viva la vecchia funzione (e i
-- suoi grant). Si droppa la firma vecchia e si ricrea con
-- p_eventi jsonb, es. {"letture": 2, "colazione": 3}.

drop function if exists public.passa_lacqua_iscrivi(
  text, text, text, text[], text, boolean, uuid[], boolean, boolean, text
);

create function public.passa_lacqua_iscrivi(
  p_nome            text,
  p_telefono        text,
  p_email           text    default null,
  p_interessi       text[]  default '{}',
  p_come_conosciuto text    default null,
  p_partecipa       boolean default false,
  p_slot_ids        uuid[]  default '{}',
  p_eventi          jsonb   default '{}',
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
  v_id      uuid;
  v_tel     text;
  v_evento  text;
  v_persone text;
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

  -- stessa regola per gli eventi: l'ultimo invio sostituisce tutto.
  -- Chiavi sconosciute o numeri non validi si scartano senza errore:
  -- il modulo pubblico non deve fallire per un payload manomesso.
  delete from public.passa_lacqua_eventi_richiesti where iscrizione_id = v_id;

  for v_evento, v_persone in
    select key, value from jsonb_each_text(coalesce(p_eventi, '{}'))
  loop
    if v_evento in ('letture', 'yoga', 'colazione')
       and v_persone ~ '^\d{1,2}$'
       and v_persone::int between 1 and 20 then
      insert into public.passa_lacqua_eventi_richiesti (iscrizione_id, evento, persone)
      values (v_id, v_evento, v_persone::int)
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end
$$;

-- ---- permessi ----------------------------------------------

revoke all on function public.passa_lacqua_iscrivi(
  text, text, text, text[], text, boolean, uuid[], jsonb, boolean, boolean, text
) from public;

grant execute on function public.passa_lacqua_iscrivi(
  text, text, text, text[], text, boolean, uuid[], jsonb, boolean, boolean, text
) to anon, authenticated;
