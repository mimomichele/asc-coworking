-- ============================================================
-- Database Webhook: notifica Telegram su ogni nuovo preventivo
--
-- Pattern identico a notify-order (rosticceria): un trigger
-- AFTER INSERT su richieste_preventivo chiama via pg_net la
-- Edge Function preventivi-notify-nuovo, che manda un messaggio
-- breve al gruppo Telegram della reception.
--
-- Vale per TUTTE le origini: email (via preventivi-da-email) e
-- manuali (via la pagina Nuova richiesta).
-- ============================================================

create or replace function public.preventivi_notify_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := 'https://psqcexrgimkxohrmtcan.supabase.co/functions/v1/preventivi-notify-nuovo';
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
  v_payload jsonb := jsonb_build_object(
    'type', 'INSERT',
    'table', 'richieste_preventivo',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', null
  );
begin
  perform net.http_post(url := v_url, headers := v_headers, body := v_payload);
  return NEW;
exception when others then
  -- Non blocchiamo mai l'INSERT per un errore di notifica.
  raise warning 'preventivi_notify_insert fallita: %', sqlerrm;
  return NEW;
end
$$;

drop trigger if exists trg_preventivi_notify_insert on public.richieste_preventivo;
create trigger trg_preventivi_notify_insert
  after insert on public.richieste_preventivo
  for each row execute function public.preventivi_notify_insert();
