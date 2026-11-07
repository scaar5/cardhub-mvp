-- 008 · Alertas creíbles: foto del anuncio y comparables guardados con cada chollo
-- photo_url  → 1.ª foto del anuncio de Vinted (la de la página de resultados)
-- ref_comps  → copia de las ventas / anuncios que forman el precio de referencia
--              [{ title, price, url, date, platform, photo_url }], para enseñarlos aunque el anuncio desaparezca
alter table public.deals add column if not exists photo_url text;
alter table public.deals add column if not exists ref_comps jsonb;
