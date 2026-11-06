-- 005 · Votos de las alertas de Telegram (✅ bueno / ❌ falso) y datos de la referencia usada
alter table public.deals
  add column if not exists feedback text check (feedback in ('bueno','falso')),
  add column if not exists feedback_at timestamptz,
  add column if not exists ref_source text,
  add column if not exists ref_sample int,
  add column if not exists ref_level int;
