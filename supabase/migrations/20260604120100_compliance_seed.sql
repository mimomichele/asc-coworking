-- ============================================================
-- Migration: Compliance — seed (categorie, fornitori, adempimenti)
-- ============================================================
-- Adattato da 02_seed.sql ai nomi compliance_*. Tutti i blocchi
-- usano lo stesso pattern pulito (anche Antincendio, normalizzato).
-- Risultato: 8 categorie, 10 fornitori, 51 adempimenti precaricati.
-- Idempotenza categorie/fornitori via guardia "where not exists".
-- ============================================================

-- ===== CATEGORIE =====
insert into compliance_categories (nome, colore, icona, ordine)
select * from (values
  ('Antincendio', '#D85A30', 'ti-flame', 1),
  ('Sicurezza lavoro', '#185FA5', 'ti-shield-check', 2),
  ('Acque e Legionella', '#1D9E75', 'ti-droplet', 3),
  ('Piscina', '#378ADD', 'ti-pool', 4),
  ('HACCP / Alimentare', '#BA7517', 'ti-chef-hat', 5),
  ('Societario / Fiscale', '#534AB7', 'ti-file-text', 6),
  ('Privacy / GDPR', '#993556', 'ti-lock', 7),
  ('Impianti tecnici', '#5F5E5A', 'ti-tools', 8)
) as v(nome, colore, icona, ordine)
where not exists (select 1 from compliance_categories);

-- ===== FORNITORI =====
insert into compliance_fornitori (nome, note)
select * from (values
  ('Da definire', 'Placeholder iniziale - sostituire con fornitore reale'),
  ('Dott. Mencaroni - Commercialista', 'Adempimenti societari e fiscali'),
  ('Avv. Vannelli', 'Consulenza legale'),
  ('Medico Competente', 'Sorveglianza sanitaria - da nominare/confermare'),
  ('RSPP', 'Responsabile Servizio Prevenzione e Protezione'),
  ('Lab. Analisi Acque', 'Legionella, potabilità, piscina'),
  ('Ditta Antincendio', 'Estintori, naspi, rilevazione fumi'),
  ('Ditta Disinfestazione', 'Derattizzazione e disinfestazione'),
  ('Verificatore impianti DPR 462', 'Messa a terra biennale'),
  ('Manutentore ascensori', 'Verifiche semestrali e biennali')
) as v(nome, note)
where not exists (select 1 from compliance_fornitori);

-- ===== ADEMPIMENTI =====
-- Antincendio
with cat as (select id from compliance_categories where nome = 'Antincendio')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('CPI / SCIA antincendio', 'DPR 151/2011', 60, 'ti-certificate', 'Rinnovo asseverazione ogni 5 anni. ATTENZIONE: pratica in corso, verificare stato SCIA.'),
  ('Manutenzione estintori', 'UNI 9994-1', 6, 'ti-fire-extinguisher', 'Controllo semestrale da tecnico abilitato'),
  ('Manutenzione naspi/idranti', 'UNI 671-3 / UNI 10779', 6, 'ti-droplet-filled-2', 'Controllo periodico semestrale'),
  ('Prova di pressione naspi/idranti', 'UNI 10779', 12, 'ti-gauge', 'Verifica annuale pressione e portata. PROBLEMA APERTO: pressione insufficiente, valutare gruppo pressurizzazione.'),
  ('Manutenzione impianto rilevazione fumi', 'UNI 11224', 6, 'ti-alarm', 'Controllo semestrale centrali e rivelatori'),
  ('Manutenzione luci di emergenza', 'UNI EN 50172', 6, 'ti-bulb', 'Test autonomia e funzionamento'),
  ('Manutenzione porte tagliafuoco', 'UNI 11473', 12, 'ti-door', 'Verifica chiusura, guarnizioni, maniglione'),
  ('Prova di evacuazione', 'D.Lgs. 81/08', 12, 'ti-run', 'Esercitazione antincendio annuale obbligatoria'),
  ('Registro controlli antincendio', 'DM 01/09/2021', 1, 'ti-clipboard-list', 'Compilazione interna mensile')
) as v(titolo, norm, freq, icona, note);

-- Sicurezza lavoro
with cat as (select id from compliance_categories where nome = 'Sicurezza lavoro')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('DVR - Documento Valutazione Rischi', 'D.Lgs. 81/08 art. 28-29', null, 'ti-file-shield', 'Revisione ad ogni modifica organizzativa/impiantistica. Non periodico ma da rivedere.'),
  ('DVR Legionella', 'Linee Guida 2015', 24, 'ti-file-shield', 'Revisione biennale o al variare delle condizioni'),
  ('Riunione periodica sicurezza', 'D.Lgs. 81/08 art. 35', 12, 'ti-users', 'Obbligatoria se >15 dipendenti'),
  ('Sorveglianza sanitaria - visite mediche', 'D.Lgs. 81/08 art. 41', 12, 'ti-stethoscope', 'Frequenza definita dal Medico Competente nel protocollo sanitario'),
  ('Formazione lavoratori - aggiornamento', 'Accordo Stato-Regioni 2011', 60, 'ti-school', '6 ore aggiornamento ogni quinquennio'),
  ('Formazione preposti - aggiornamento', 'Accordo Stato-Regioni 2011', 60, 'ti-school', '6 ore aggiornamento quinquennale'),
  ('Formazione dirigenti - aggiornamento', 'Accordo Stato-Regioni 2011', 60, 'ti-school', 'Aggiornamento quinquennale'),
  ('Formazione RSPP datore di lavoro', 'D.Lgs. 81/08', 60, 'ti-school', 'Aggiornamento quinquennale'),
  ('Formazione addetti antincendio', 'DM 02/09/2021', 60, 'ti-school', 'Aggiornamento quinquennale - livello 2 per hotel'),
  ('Formazione addetti primo soccorso', 'DM 388/03', 36, 'ti-first-aid-kit', 'Aggiornamento triennale gruppo B'),
  ('Formazione RLS', 'D.Lgs. 81/08', 12, 'ti-school', '8 ore annue se <50 dipendenti'),
  ('Verifica impianto messa a terra', 'DPR 462/01', 24, 'ti-bolt', 'Verifica biennale da organismo abilitato'),
  ('Verifica periodica ascensori', 'DPR 162/99', 6, 'ti-elevator', 'Manutentore semestrale'),
  ('Verifica biennale ascensori', 'DPR 162/99', 24, 'ti-elevator', 'Verifica da organismo notificato')
) as v(titolo, norm, freq, icona, note);

-- Acque e Legionella
with cat as (select id from compliance_categories where nome = 'Acque e Legionella')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Analisi legionella - punti distali', 'Linee Guida 2015', 6, 'ti-test-pipe', 'Frequenza standard hotel medio rischio'),
  ('Analisi legionella pre-riapertura stagionale', 'Linee Guida 2015', 12, 'ti-test-pipe', 'Prima riapertura piscina/struttura dopo chiusura prolungata'),
  ('Analisi potabilità acqua', 'D.Lgs. 31/01', 12, 'ti-droplet-check', 'Secondo prescrizioni ASL'),
  ('Pulizia e disinfezione serbatoi', 'Linee Guida 2015', 12, 'ti-spray', 'Manutenzione straordinaria serbatoi accumulo ACS')
) as v(titolo, norm, freq, icona, note);

-- Piscina
with cat as (select id from compliance_categories where nome = 'Piscina')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Analisi microbiologiche acqua piscina', 'Accordo Stato-Regioni 16/01/2003', 1, 'ti-test-pipe', 'Mensile durante stagione apertura (giugno-settembre)'),
  ('Verifica impianto trattamento acqua piscina', 'Accordo Stato-Regioni 2003', 12, 'ti-tool', 'Manutenzione pre-apertura stagionale'),
  ('Documento valutazione rischio piscina', 'LR Toscana', 12, 'ti-file-shield', 'Aggiornamento pre-stagione')
) as v(titolo, norm, freq, icona, note);

-- HACCP / Alimentare
with cat as (select id from compliance_categories where nome = 'HACCP / Alimentare')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Manuale autocontrollo HACCP', 'Reg. CE 852/04', 12, 'ti-book', 'Revisione e aggiornamento annuale'),
  ('Formazione alimentaristi - aggiornamento', 'LR Toscana 24/05/2005 n.18', 60, 'ti-school', 'Attestato HACCP livello base'),
  ('Formazione responsabile HACCP', 'LR Toscana', 36, 'ti-school', 'Attestato livello superiore'),
  ('Tarature termometri', 'Reg. CE 852/04', 12, 'ti-temperature', 'Verifica annuale strumenti misurazione temperature'),
  ('Analisi tamponi superfici cucina', 'Piano autocontrollo', 6, 'ti-test-pipe', 'Tamponi ambientali cucina'),
  ('Analisi microbiologiche alimenti', 'Piano autocontrollo', 6, 'ti-test-pipe', 'Campioni prodotti finiti/semilavorati'),
  ('Derattizzazione/disinfestazione', 'Reg. CE 852/04', 3, 'ti-bug', 'Contratto trimestrale con ditta specializzata'),
  ('Pulizia cappe e canne fumarie', 'DM 37/08 + Reg. CE', 12, 'ti-wind', 'Pulizia certificata annuale')
) as v(titolo, norm, freq, icona, note);

-- Societario / Fiscale
with cat as (select id from compliance_categories where nome = 'Societario / Fiscale')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Deposito bilancio CCIAA', 'Codice Civile', 12, 'ti-file-text', 'Entro 30 gg da approvazione assemblea (di norma entro aprile)'),
  ('Diritto annuale CCIAA', 'L. 580/93', 12, 'ti-receipt', 'Versamento annuale tramite F24'),
  ('Dichiarazione dei redditi società', 'TUIR', 12, 'ti-file-text', 'Entro 30/11 dell''anno successivo'),
  ('Libro unico del lavoro', 'D.L. 112/08', 1, 'ti-book', 'Aggiornamento mensile'),
  ('Comunicazione ISTAT turismo', null, 1, 'ti-chart-bar', 'Trasmissione mensile dati alloggiati'),
  ('Versamento tassa di soggiorno', 'Regolamento comunale', 3, 'ti-receipt', 'Secondo scadenze regolamento Comune di Arezzo')
) as v(titolo, norm, freq, icona, note);

-- Privacy / GDPR
with cat as (select id from compliance_categories where nome = 'Privacy / GDPR')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Registro trattamenti', 'GDPR art. 30', 12, 'ti-book', 'Revisione e aggiornamento annuale'),
  ('Audit privacy interno', 'GDPR', 12, 'ti-checklist', 'Verifica conformità annuale'),
  ('Aggiornamento informative privacy', 'GDPR art. 13-14', 24, 'ti-file-text', 'Revisione biennale o al variare dei trattamenti')
) as v(titolo, norm, freq, icona, note);

-- Impianti tecnici
with cat as (select id from compliance_categories where nome = 'Impianti tecnici')
insert into compliance_adempimenti (titolo, categoria_id, riferimento_normativo, frequenza_mesi, icona, note)
select v.titolo, cat.id, v.norm, v.freq, v.icona, v.note
from cat, (values
  ('Manutenzione caldaia', 'DPR 74/2013', 12, 'ti-flame', 'Controllo annuale efficienza energetica'),
  ('Bollino verde caldaia', 'DPR 74/2013', 24, 'ti-certificate', 'Verifica fumi biennale (>100 kW annuale)'),
  ('Manutenzione climatizzazione', 'DPR 74/2013', 12, 'ti-snowflake', 'Controllo annuale efficienza split/VRF'),
  ('Verifica F-Gas impianti refrigerazione', 'Reg. UE 517/2014', 12, 'ti-snowflake', 'Controllo perdite per impianti con >5 ton CO2 eq')
) as v(titolo, norm, freq, icona, note);
