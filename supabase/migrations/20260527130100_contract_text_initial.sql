-- ============================================================
-- Seed: testo iniziale del contratto di membership.
-- ============================================================
-- Inserisce UNA riga in `contracts` con il body completo del
-- contratto. Idempotente: se la tabella e' gia' popolata, non
-- inserisce nulla (where not exists).
--
-- Il body e' un TEMPLATE con placeholder che la Edge Function
-- `sign-contract` (Fase 2) sostituira' coi dati reali dell'ospite
-- al momento della generazione del PDF:
--
--   {{NOME_COGNOME}}      → accounts.name + ' ' + accounts.surname
--   {{LUOGO_NASCITA}}     → members.luogo_nascita_testo
--   {{DATA_NASCITA}}      → members.data_nascita (formato GG/MM/AAAA)
--   {{RESIDENZA}}         → members.residenza
--   {{CODICE_FISCALE}}    → members.codice_fiscale (upper)
--   {{NUMERO_DOCUMENTO}}  → members.numero_documento
--   {{DATA_FIRMA}}        → signed_at (formato GG mese AAAA, fuso IT)
--
-- Modifiche future al testo: UPDATE diretto su questa riga via
-- SQL Editor. I PDF gia' firmati conservano nello Storage lo
-- snapshot del testo al momento della firma.
-- ============================================================

insert into contracts (title, body)
select
  'Contratto di membership — ASC Hotel',
  $body$Servizi di coworking, accesso piscina e honesty bar
ASC HOTEL — Arezzo Sport College S.r.l.


Tra

Arezzo Sport College S.r.l., con sede legale in Arezzo (AR), Via di Castelsecco 8/H, CAP 52100, P.IVA 02044450514, PEC aschotel@pec.it, in persona del legale rappresentante (di seguito "la Società" o "ASC Hotel")

e

il/la sottoscritto/a
Sig./Sig.ra {{NOME_COGNOME}}
nato/a a {{LUOGO_NASCITA}}
il {{DATA_NASCITA}}, residente in {{RESIDENZA}}
C.F. {{CODICE_FISCALE}}
documento n. {{NUMERO_DOCUMENTO}} (di seguito "il Member"),


premesso

che ASC Hotel è una struttura ricettiva dotata di spazi per attività di lavoro condiviso (coworking), di piscina ad uso natatorio e di servizio honesty bar, e che la Società intende offrire a soggetti esterni la possibilità di fruire di tali servizi mediante adesione a una membership che li qualifica come clienti della struttura,

che la piscina dell'ASC Hotel costituisce un servizio accessorio e complementare all'attività ricettiva e alla membership, destinato esclusivamente ai clienti alloggiati e ai titolari di membership in corso di validità, e non è in alcun modo aperta al pubblico indistinto, né destinata alla vendita di ingressi singoli al solo impianto natatorio,

si conviene e stipula quanto segue.


Art. 1 - Oggetto e qualifica del Member
Con la sottoscrizione del presente contratto il Member aderisce alla membership di ASC Hotel e acquisisce, per l'effetto, la qualità di cliente della struttura, con diritto di accesso ai servizi indicati all'art. 2 secondo le modalità e i limiti del presente contratto e del regolamento interno.
L'accesso alla piscina avviene esclusivamente in quanto servizio accessorio e complementare alla ricettività alberghiera e alla membership, nell'ambito del rapporto contrattuale che lega il Member e gli ospiti alla Società.
L'accesso ai servizi, e in particolare alla piscina, è riservato esclusivamente ai titolari di membership in corso di validità e agli ospiti alloggiati: non costituisce in alcun caso apertura al pubblico indistinto né vendita di singoli ingressi.
È pertanto esclusa qualsivoglia forma di commercializzazione della piscina mediante biglietti o ingressi singoli a favore di soggetti che non rivestano la qualità di clienti alloggiati o di titolari di membership.


Art. 1-bis - Natura e qualificazione della piscina
1. La piscina dell'ASC Hotel costituisce parte integrante dei servizi accessori della struttura ricettiva ed è qualificata e gestita come piscina privata ad uso collettivo a servizio della stessa, in favore esclusivo dei clienti alloggiati e dei titolari di membership (congiuntamente, i "Clienti").
2. La piscina non è aperta al pubblico indistinto e non è gestita come impianto natatorio pubblico o struttura sportiva a pagamento aperta a terzi; è espressamente vietata la vendita di ingressi singoli al solo utilizzo della piscina a soggetti che non rivestano la qualità di Clienti.
3. L'accesso e l'utilizzo della piscina sono strettamente collegati al rapporto di ospitalità o di membership e non possono costituire oggetto di distinta contrattazione o cessione a terzi non Clienti della struttura.
4. È fatto divieto al Member di consentire l'uso della piscina a soggetti terzi non qualificabili come Clienti, salvo espressa e preventiva autorizzazione della Società, restando inteso che eventuali accessi non autorizzati potranno comportare la sospensione o revoca della membership ai sensi dell'art. 7.


Art. 2 - Servizi inclusi
La membership dà diritto di accesso ai seguenti servizi della struttura:
- spazi di coworking (postazioni di lavoro e relativi servizi comuni);
- piscina ad uso natatorio, nei termini e con i limiti di cui all'art. 4;
- honesty bar, con pagamento delle consumazioni secondo il sistema di autogestione esposto.
La Società si riserva di disciplinare l'accesso ai singoli servizi mediante il regolamento interno, che il Member dichiara di conoscere e accettare.


Art. 3 - Durata e tariffazione
La membership è tariffata secondo il listino vigente esposto e/o comunicato al Member all'atto dell'adesione.
Il presente contratto ha durata pari all'anno solare in corso alla data di sottoscrizione e cessa automaticamente al 31 dicembre del medesimo anno, senza necessità di disdetta. La fruizione effettiva dei servizi avviene nelle giornate per le quali il Member ha titolo secondo la formula acquistata.


Art. 4 - Accesso alla piscina e sicurezza
L'accesso alla piscina è consentito esclusivamente in presenza dell'assistente ai bagnanti (bagnino) abilitato. In assenza di tale figura la vasca è inaccessibile e ne è vietato l'utilizzo.
Le modalità di accesso, gli orari di apertura, i limiti di capienza, le informazioni sulle caratteristiche dell'impianto e le regole di comportamento sono disciplinati dal regolamento interno della piscina, predisposto dalla Società in conformità alla normativa applicabile.
Il Member è tenuto a rispettare il regolamento interno della piscina esposto all'ingresso, le indicazioni dell'assistente ai bagnanti e del personale, il limite di capienza e i divieti ivi previsti.
Il regolamento interno della piscina forma parte integrante del presente contratto e il Member dichiara di averne preso visione prima dell'accesso all'area piscina.
Il Member dichiara di essere in idonee condizioni psico-fisiche per l'accesso in acqua e si impegna a un utilizzo prudente e conforme alle regole dell'impianto.
I minori sono ammessi esclusivamente se accompagnati e costantemente vigilati da un adulto responsabile, che ne risponde a ogni effetto; l'accompagnatore è tenuto al rispetto del regolamento e delle indicazioni del personale.


Art. 5 - Honesty bar
Il servizio honesty bar è fondato sulla correttezza e l'autogestione del Member, che si impegna a registrare e corrispondere il prezzo delle consumazioni prelevate secondo le modalità e il listino esposti.


Art. 6 - Obblighi e responsabilità del Member
Il Member si impegna a utilizzare gli spazi e i servizi con diligenza, a non arrecare danni a persone o cose e a rispettare le norme di comportamento, igiene e sicurezza della struttura.
Il Member è responsabile dei danni cagionati per fatto proprio o delle persone di cui debba rispondere (inclusi i minori accompagnati). La Società non risponde dei beni personali lasciati incustoditi negli spazi comuni o nelle aree piscina.
La Società risponde nei limiti di legge per i danni a essa imputabili; resta ferma la responsabilità del Member per l'uso non conforme dei servizi e per la violazione del regolamento.


Art. 7 - Sospensione e recesso
La Società può sospendere o revocare la membership, senza rimborso, in caso di violazione del presente contratto o del regolamento interno, di comportamenti pericolosi o lesivi del decoro e della sicurezza, o di mancato pagamento.
Costituiscono in particolare gravi violazioni, rilevanti ai fini della sospensione o revoca, l'utilizzo della piscina in modo non conforme alla sua qualificazione di servizio accessorio riservato ai soli Clienti, nonché l'agevolazione o il consentire l'accesso alla piscina a soggetti terzi estranei alla struttura.
Eventuali cause di forza maggiore o provvedimenti dell'autorità che impediscano l'uso dei servizi (es. chiusura temporanea della piscina) non danno luogo a rimborso oltre i limiti di legge.


Art. 8 - Trattamento dei dati personali
I dati personali del Member sono trattati dalla Società, quale titolare del trattamento, per la gestione del rapporto contrattuale e per gli adempimenti di legge, ivi compresa, ove dovuta, la comunicazione delle generalità alle autorità di pubblica sicurezza ai sensi dell'art. 109 TULPS. Il trattamento avviene nel rispetto del Reg. UE 2016/679 (GDPR) secondo l'informativa consegnata al Member.


Art. 9 - Rinvio al regolamento interno
Per quanto non espressamente previsto, si rinvia al regolamento interno della struttura e della piscina, che forma parte integrante del presente contratto e che il Member dichiara di conoscere e accettare.


Art. 10 - Foro competente
Per ogni controversia relativa al presente contratto è competente il Foro di Arezzo, fatte salve le disposizioni inderogabili di legge a tutela del consumatore.


Luogo e data: Arezzo, {{DATA_FIRMA}}

La Società (ASC Hotel)

Il Member: {{NOME_COGNOME}}


Ai sensi degli artt. 1341 e 1342 c.c., il Member dichiara di approvare specificamente le clausole di cui agli articoli: 4 (accesso piscina e sicurezza), 6 (responsabilità del Member), 7 (sospensione e recesso senza rimborso), 10 (foro competente).

Il Member: {{NOME_COGNOME}}$body$
where not exists (select 1 from contracts);
