-- ============================================================
-- Passa l'Acqua — accesso ADMIN alle iscrizioni (fase 2, parte 1)
--
-- Le tabelle sono nate con RLS attiva e ZERO policy: nessuno le
-- legge via API (fase 1: solo Supabase Studio col service_role).
-- Qui si apre la lettura e la gestione dello stato ai SOLI admin,
-- col pattern già usato nel progetto (profiles.role = 'admin').
--
-- ATTENZIONE: mai "to authenticated using (true)" — in questa app
-- anche gli ospiti sono authenticated e NON devono vedere nomi e
-- telefoni degli iscritti. Il filtro sul ruolo sta nella USING.
--
-- L'UPDATE admin serve solo per lo stato della richiesta e le note
-- interne: la RLS filtra le righe ma non le colonne, quindi il
-- limite di colonna si impone coi GRANT (revoke + grant di colonna).
-- ============================================================

-- lettura iscrizioni: solo admin
create policy pl_iscrizioni_select_admin on public.passa_lacqua_iscrizioni
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- aggiornamento (stato / note_admin): solo admin
create policy pl_iscrizioni_update_admin on public.passa_lacqua_iscrizioni
  for update to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- lettura turni preferiti: solo admin
create policy pl_turni_select_admin on public.passa_lacqua_turni_richiesti
  for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- l'UPDATE può toccare SOLO stato e note_admin: i dati di contatto
-- e i consensi restano immutabili anche per l'admin
revoke update on public.passa_lacqua_iscrizioni from anon, authenticated;
grant update (stato, note_admin) on public.passa_lacqua_iscrizioni to authenticated;
