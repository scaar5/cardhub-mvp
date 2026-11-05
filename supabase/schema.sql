-- Ejecuta esto en Supabase → SQL Editor → New query → Run

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('vinted', 'wallapop')),
  price numeric(10,2) not null,
  market_value numeric(10,2) not null,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists deals_created_at_idx on public.deals (created_at desc);

-- Lectura pública (la web usa la anon key); escritura solo con service_role
alter table public.deals enable row level security;

drop policy if exists "deals lectura publica" on public.deals;
create policy "deals lectura publica" on public.deals
  for select using (true);

-- Fila de prueba
insert into public.deals (title, platform, price, market_value, url)
values ('Panini Adrenalyn XL — Prueba Supabase', 'vinted', 10, 25, null);
