-- sCARDs · migración 002: sniper de eBay + valorador
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (se puede repetir sin problema)

-- 1) Permitir la plataforma 'ebay'
alter table public.deals drop constraint if exists deals_platform_check;
alter table public.deals
  add constraint deals_platform_check check (platform in ('vinted', 'wallapop', 'ebay'));

-- 2) Identificador del anuncio (evita duplicados y alertas repetidas)
alter table public.deals add column if not exists external_id text;
create unique index if not exists deals_external_id_key on public.deals (external_id);

-- 3) Búsqueda con la que se encontró / valoró
alter table public.deals add column if not exists query text;

-- 4) Quitar la fila de prueba
delete from public.deals where title = 'Panini Adrenalyn XL — Prueba Supabase';
