-- 009 · Voto en dos preguntas en las alertas de Telegram
-- fb_card → ¿es la carta?        'si' | 'otra' (otra paralela/carta) | 'lote' (lote / graduada / dañada)
-- fb_ref  → ¿qué dice 130point?  'ok' (parecido) | 'alta' (referencia inflada) | 'baja' (se vende más caro) | 'nose' (sin ventas)
-- deals.feedback ('bueno'/'falso') se sigue rellenando a partir de estas dos respuestas.
alter table public.deals
  add column if not exists fb_card text check (fb_card in ('si','otra','lote')),
  add column if not exists fb_ref text check (fb_ref in ('ok','alta','baja','nose'));
