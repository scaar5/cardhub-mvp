-- sCARDs · migración 003: catálogo de cartas + historial de anuncios
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (se puede repetir sin problema)

-- 1) Colecciones (una fila por producto y temporada: "Topps Chrome UCC 2025-26")
create table if not exists public.sets (
  slug text primary key,                 -- p. ej. 'topps-chrome-ucc-2025-26'
  name text not null,                    -- nombre para mostrar
  brand text not null,                   -- 'Topps' | 'Panini'
  season text not null,                  -- '2025-26'
  competition text,                      -- 'UEFA Club Competitions', 'Premier League', 'LaLiga'...
  aliases text[] not null default '{}',  -- palabras con las que aparece en los títulos de anuncios
  parallels text[] not null default '{}',-- variantes conocidas (Refractor, Gold /50...)
  card_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- 2) Cartas del catálogo (la carta "base"; las variantes van en listings.parallel)
create table if not exists public.cards (
  id text primary key,                   -- '<set>:<subset>:<número>'
  set_slug text not null references public.sets(slug) on delete cascade,
  number text not null,                  -- '10', 'FF-8', 'WK-3'...
  player text not null,
  team text,
  subset text not null default 'Base',   -- 'Base' o el nombre del insert
  rookie boolean not null default false,
  search_text text not null,             -- jugador + equipo + colección, normalizado (sin acentos)
  created_at timestamptz not null default now()
);
create index if not exists cards_set_idx on public.cards (set_slug);
create index if not exists cards_player_idx on public.cards (lower(player));

-- Búsqueda rápida por texto (jugador, equipo, colección)
create extension if not exists pg_trgm;
create index if not exists cards_search_trgm on public.cards using gin (search_text gin_trgm_ops);

-- 3) Historial de anuncios vistos (para calcular el precio de cada carta)
create table if not exists public.listings (
  id bigint generated always as identity primary key,
  external_id text unique not null,      -- 'ebay:123', 'vinted:<url>'...
  card_id text references public.cards(id) on delete set null,
  parallel text,                         -- 'Refractor', 'Gold /50'... null = base
  platform text not null,
  title text not null,
  price numeric(10,2) not null,
  url text,
  seen_at timestamptz not null default now()
);
create index if not exists listings_card_idx on public.listings (card_id, parallel, seen_at desc);

-- 4) Enlazar los chollos con su carta
alter table public.deals add column if not exists card_id text references public.cards(id) on delete set null;
alter table public.deals add column if not exists parallel text;

-- 5) Seguridad: lectura pública, escritura solo con la clave secreta
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.listings enable row level security;

drop policy if exists "sets lectura" on public.sets;
create policy "sets lectura" on public.sets for select using (true);
drop policy if exists "cards lectura" on public.cards;
create policy "cards lectura" on public.cards for select using (true);
drop policy if exists "listings lectura" on public.listings;
create policy "listings lectura" on public.listings for select using (true);

grant select on public.sets, public.cards, public.listings to anon, authenticated;
