-- 007 · Cuándo se revisó por última vez cada anuncio de Vinted (vinted-sold revisa primero los más olvidados)
alter table public.listings add column if not exists checked_at timestamptz;
