-- 006 · Fotos de las ventas de Vinted
-- photo_url  = foto original del anuncio (Vinted)
-- photo_path = copia propia en Supabase Storage (bucket "ventas", miniatura WebP ~400 px)
alter table public.listings
  add column if not exists photo_path text,
  add column if not exists photo_url text;

-- Bucket público para las miniaturas (máx. 1 MB por foto)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ventas', 'ventas', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;
