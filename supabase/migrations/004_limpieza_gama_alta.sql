-- sCARDs · migración 004: limpieza del catálogo (enfoque gama alta, v0.7)
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (se puede repetir sin problema).
--
-- Borra todo lo de las colecciones que salen del catálogo:
--   Match Attax (25-26 y 26-27), Megacracks 25-26, Adrenalyn (LaLiga 25-26 y Mundial 2026),
--   Topps Summer Signings 26-27, Topps flagship UCC (24-25 y 25-26) y Topps flagship Premier League 25-26.
-- Y la morralla sin carta: los 120 "chollos" falsos de eBay de la v0.4 y cualquier anuncio sin carta reconocida.

-- 1) Chollos de esas colecciones, y los de eBay sin carta (los falsos de la v0.4).
--    Los que valoraste a mano en "Valorar" (Vinted/Wallapop sin carta) se conservan.
delete from public.deals
where (card_id is null and platform = 'ebay')
   or card_id like 'topps-match-attax-%'
   or card_id like 'panini-megacracks-%'
   or card_id like 'panini-adrenalyn-%'
   or card_id like 'topps-summer-signings-%'
   or card_id like 'topps-ucc-%'
   or card_id like 'topps-premier-league-%';

-- 2) Precios de referencia (eBay) y anuncios vistos de esas colecciones
delete from public.listings
where card_id is null
   or card_id like 'topps-match-attax-%'
   or card_id like 'panini-megacracks-%'
   or card_id like 'panini-adrenalyn-%'
   or card_id like 'topps-summer-signings-%'
   or card_id like 'topps-ucc-%'
   or card_id like 'topps-premier-league-%';

-- 3) Las colecciones en sí (sus cartas se borran solas: cards → sets es "on delete cascade")
delete from public.sets
where slug in (
  'topps-match-attax-ucc-2025-26',
  'topps-match-attax-ucc-2026-27',
  'panini-megacracks-2025-26',
  'panini-adrenalyn-laliga-2025-26',
  'panini-adrenalyn-world-cup-2026',
  'topps-summer-signings-ucc-2026-27',
  'topps-ucc-2024-25',
  'topps-ucc-2025-26',
  'topps-premier-league-2025-26'
);

-- 4) Comprobación: debe devolver 0 en las tres columnas
select
  (select count(*) from public.sets where slug like 'topps-match-attax-%' or slug like 'panini-megacracks-%' or slug like 'panini-adrenalyn-%' or slug like 'topps-summer-signings-%' or slug like 'topps-ucc-%' or slug like 'topps-premier-league-%') as sets_viejos,
  (select count(*) from public.cards where set_slug like 'topps-match-attax-%' or set_slug like 'panini-megacracks-%' or set_slug like 'panini-adrenalyn-%' or set_slug like 'topps-summer-signings-%' or set_slug like 'topps-ucc-%' or set_slug like 'topps-premier-league-%') as cartas_viejas,
  (select count(*) from public.listings where card_id is null) as anuncios_sin_carta;
