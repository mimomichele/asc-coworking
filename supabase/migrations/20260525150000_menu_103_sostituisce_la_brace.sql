-- ============================================================
-- Migration: sostituzione menu La Brace → menu "103"
-- ============================================================
-- - Disattiva i 51 prodotti La Brace (is_active=false). NON cancella:
--   FK order_items.product_id ON DELETE RESTRICT preserva lo storico
--   ordini (e order_items.product_name e' denormalizzato comunque).
-- - Pulisce daily_menu futuro/odierno che referenzia prodotti vecchi
--   (le righe passate restano: sono storia del menu del giorno X).
-- - Riusa "Antipasti", "Secondi", "Contorni"; crea "Primi piatti" e
--   "Piatto unico". Sort_order pulito 10/20/30/40/50.
-- - Inserisce i 33 prodotti del menu 103.
--
-- ATTENZIONE: eseguire UNA SOLA VOLTA. Non e' idempotente: gli INSERT
-- duplicherebbero i prodotti se rilanciati.
--
-- Applicata sul DB il 2026-05-25. Verifiche post-apply:
--   33 prodotti attivi, 51 disattivati,
--   5 categorie del menu 103 con sort_order 10/20/30/40/50,
--   conteggi prodotti per categoria 5/4/13/6/5.
-- ============================================================

begin;

-- 1) Disattiva tutti i prodotti attualmente attivi (i 51 La Brace).
update products set is_active = false where is_active = true;

-- 2) Pulisci daily_menu di oggi e date future che puntano a prodotti
--    appena disattivati. Le righe passate restano (storia del menu).
--    "oggi" in fuso Europe/Rome per coerenza col cliente.
delete from daily_menu
where date >= (now() at time zone 'Europe/Rome')::date
  and product_id in (select id from products where is_active = false);

-- 3) Riusa categorie esistenti col sort_order pulito.
update menu_categories set sort_order = 10 where name = 'Antipasti';
update menu_categories set sort_order = 40 where name = 'Secondi';
update menu_categories set sort_order = 50 where name = 'Contorni';

-- 4) Crea le 2 categorie nuove (idempotente via UNIQUE(name)).
insert into menu_categories (name, sort_order) values
  ('Primi piatti', 20),
  ('Piatto unico', 30)
on conflict (name) do update set sort_order = excluded.sort_order;

-- 5) Inserisci i 33 prodotti del menu 103 (tutti is_active=true).
insert into products (name, description, price, category_id, is_active) values
  -- ANTIPASTI (5)
  ('Crostini neri 4pz',                                       null, 4.50, (select id from menu_categories where name = 'Antipasti'),    true),
  ('Crostini rossi 4pz',                                      null, 4.00, (select id from menu_categories where name = 'Antipasti'),    true),
  ('Crostini tartufo 4pz',                                    null, 4.50, (select id from menu_categories where name = 'Antipasti'),    true),
  ('Crostini tonno 4pz',                                      null, 4.00, (select id from menu_categories where name = 'Antipasti'),    true),
  ('Crostino funghi 4pz',                                     null, 4.50, (select id from menu_categories where name = 'Antipasti'),    true),

  -- PRIMI PIATTI (4)
  ('Parmigiana di melanzane',                                 null, 8.50, (select id from menu_categories where name = 'Primi piatti'), true),
  ('Gnocchi al ragù',                                         null, 8.00, (select id from menu_categories where name = 'Primi piatti'), true),
  ('Gnocchi alla sorrentina',                                 null, 7.50, (select id from menu_categories where name = 'Primi piatti'), true),
  ('Gnocchi al pomodorino',                                   null, 7.50, (select id from menu_categories where name = 'Primi piatti'), true),

  -- PIATTO UNICO (13)
  ('Riso freddo vegetariano',                                 null, 7.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Riso freddo con verdure formaggio e prosciutto',          null, 8.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Riso freddo con zucchine, pomodorini, gamberetti e limone', null, 8.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalata di farro con pesto e pomodorini',                null, 7.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Cus-cus con verdure e agrumi',                            null, 8.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Panzanella aretina',                                      null, 7.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Pasta fredda con pesto, mozzarella e pomodorini',         null, 7.50, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Pasta fredda con tonno, pomodorini, cetrioli',            null, 7.50, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalatona vegetariana',          'Lattuga, rucola, pomodorini, cetrioli, mozzarella, olive nere, basilico',     8.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalatona con cotoletta di pollo','Lattuga, rucola, pomodorini, cotoletta pollo, scaglie di parmigiano',         9.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalatona con bresaola',         'Lattuga, rucola, pomodorini, cetrioli, mozzarella, bresaola',                  9.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalatona con salmone',          'Lattuga, rucola, pomodorini, cetrioli, salmone affumicato, limone',            9.00, (select id from menu_categories where name = 'Piatto unico'), true),
  ('Insalatona con tonno',            'Lattuga, rucola, pomodorini, cetrioli, olive nere, tonno, patate arrosto',     9.00, (select id from menu_categories where name = 'Piatto unico'), true),

  -- SECONDI (6)
  ('Panino con cotoletta di pollo e patatine',                null, 13.00, (select id from menu_categories where name = 'Secondi'),     true),
  ('Rost-beef 250 gr',                                        null, 8.50,  (select id from menu_categories where name = 'Secondi'),     true),
  ('Tacchino arrosto 250 gr',                                 null, 7.50,  (select id from menu_categories where name = 'Secondi'),     true),
  ('Arista arrosto 250 gr',                                   null, 7.50,  (select id from menu_categories where name = 'Secondi'),     true),
  ('Zucchine ripiene',                                        null, 5.00,  (select id from menu_categories where name = 'Secondi'),     true),
  ('Polpette di carne fritte 250 gr',                         null, 3.50,  (select id from menu_categories where name = 'Secondi'),     true),

  -- CONTORNI (5)
  ('Patate arrosto',                                          null, 5.00,  (select id from menu_categories where name = 'Contorni'),    true),
  ('Contorno ghiotto',                'Zucchine, melanzane, peperoni',                                                5.00,  (select id from menu_categories where name = 'Contorni'),    true),
  ('Patate fritte',                                           null, 4.00,  (select id from menu_categories where name = 'Contorni'),    true),
  ('Verdure pastellate',                                      null, 5.00,  (select id from menu_categories where name = 'Contorni'),    true),
  ('Chips artigianali',                                       null, 5.00,  (select id from menu_categories where name = 'Contorni'),    true);

commit;
