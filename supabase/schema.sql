-- Ejecuta esto en Supabase → SQL Editor → New query → Run

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('vinted', 'wallapop', 'ebay')),
  price numeric(10,2) not null,
  market_value numeric(10,2) not null,
  url text,
  external_id text unique,
  query text,
  created_at timestamptz not null default now()
);

create index if not exists deals_created_at_idx on public.deals (created_at desc);

-- Lectura pública (la web usa la anon key); escritura solo con service_role
alter table public.deals enable row level security;

drop policy if exists "deals lectura publica" on public.deals;
create policy "deals lectura publica" on public.deals
  for select using (true);

grant select on public.deals to anon, authenticated;
