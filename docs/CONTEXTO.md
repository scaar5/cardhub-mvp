# sCARDs — Contexto del proyecto (traspaso)

> Documento para retomar el proyecto en otra conversación con Claude.
> Última actualización: 7 de noviembre de 2026 (20:15, paso 30).
> Pasos 1–9: extensión Claude in Chrome. Pasos 10–30: sesión de Claude con el repositorio conectado (push directo a `main`).

## 0. Al empezar una sesión

0. **Tras el paso 30:** mirar en Telegram que las alertas llegan **con foto, referencia explicada y comparables con enlace**; en el log de `vinted-live`, `alert_photos` y `with_photo`. En `ebay-targeted` (log del sniper), los productos Chrome deberían reconocer ~55–60 % (antes 11–14 %); campos `why`/`samples` del `report` dicen por qué se pierde el resto. Revisar votos (`admin.yml` → `feedback`): el 7-nov 19:30 iban 5 votos, 4 ✅ / 1 ❌ (80 %).
1. **Primera vez tras el paso 29:** log de una ejecución terminada de **`vinted-sold`** (continuo, ~110 min): líneas `QUEUE {...}` (`open`, `open_10`, `due`, `never_checked`, `oldest_10_hours` = horas que tarda en dar la vuelta a los de ≥10 €), `TOTAL`, `RESULT` por lote, `FIN N lotes`; buscar `status 429` / `Espero 30 min`. En `vinted-live`: `BACKFILL_RESULT {...}` (recognized, `strong_deals` = chollos fuertes de páginas antiguas que NO se avisan). Si hay 429, subir `PAUSE_MS` (vinted-sold) o bajar `BACKFILL_PER_PASS`.
1b. **Tras el paso 25:** comprobar el log de una ejecución terminada de **`vinted-live.yml`**: líneas `[fecha] [...]` (una por pasada, ~cada 15 min), `{"ok":true,...}` por pasada, `FIN N pasadas`, y si aparece `Vinted ha respondido 403/429` o `Espero 30 min`. Si hay bloqueos, subir `EVERY_MINUTES` a 20–30. Comprobar en `vinted-sold` que `RESULT` trae `checked` > 0 (migración 007 ya ejecutada).
2. Lanzar `admin.yml` con `action=feedback` → % de alertas buenas y lista de las marcadas ❌ (con carta reconocida y referencia usada). Revisar por qué fallaron, corregir, medir antes/después.
3. Mirar el último log de `vinted-live` (`recognized`, `with_reference`, `deals`, `alerts`), del sniper (`ebay-targeted`: `by_market`) y del `vinted-sold` (`TOTAL {...}`: cuántas ventas encuentra; ¿algún 429?; `PHOTOS {...}` y `RESULT` con `checked`, `photos` / `photo_errors`). Ojo: al hacer grep de "429" salen falsos positivos de las marcas de tiempo; buscar `TOTAL` y `status 429`. **El log de un run en marcha no se puede leer** (la API solo lo da al terminar): `vinted-live` dura ~110 min.

## 1. Qué es

**sCARDs** es una web para detectar **chollos de cartas de fútbol de gama alta** (Topps y Panini).
- Un **sniper automático** lee los anuncios más nuevos de **Vinted cada 15 min** (`vinted-live.yml`, desde el paso 25), reconoce la carta exacta y la compara con un **precio de referencia**. Desde el paso 29 también lee **6 páginas antiguas (2–5) por pasada, por turnos**, que se guardan para seguir sus ventas **sin alerta**. Solo avisa la primera vez que ve un anuncio (alertas siempre de anuncios recién publicados).
- Referencia: **ventas reales en Vinted** cuando las hay; si no, anuncios en venta de **eBay España + Alemania** (precio pedido, en euros).
- Una página **"Valorar"** sirve para pegar a mano anuncios de **Vinted y Wallapop**. Desde v0.11 usa el mismo sistema que las alertas y enseña los comparables con enlace (con país: "eBay ES" / "eBay DE").
- Página **"Historial de ventas"** (`app/ventas`): ventas reales de Vinted detectadas, **con miniatura de la foto** (desde el paso 24).
- Los chollos llegan como **alerta por Telegram**, con botones **✅ Buen chollo / ❌ Falso**.
- **Catálogo (v0.13): 21.376 cartas en 49 colecciones**, solo gama alta / media-alta / rookies / selecciones desde 2021-22 (y 2020-21 en los productos de la fase 2).
- **Cómo funciona el catálogo:** cada carta es UNA línea (`código|jugador|equipo|RC`). Las numeradas/paralelas NO son líneas aparte: el reconocedor las detecta en el título (`detectParallel` en `lib/recognize.ts`, paralelas por set en `data/sets.json`).

**Sobre el usuario:** no es programador. Prefiere que Claude lo haga todo y que, cuando tenga que hacer algo él, se le den pasos muy concretos. Escribe en español. **Le preocupa el gasto de tokens**: leer solo lo necesario y filtrar logs. **Quiere referencias de ventas reales y precios que no se alejen de lo real** (preferir datos exactos a aproximaciones; mejor "no sé" que un precio malo). **No le interesan cartas de menos de 10 €.** Revisa las alertas y avisa de los chollos raros. **Quiere que las alertas sean creíbles** (ver de dónde sale el precio) y **una base de datos propia con fotos de cada carta vendida**. **Quiere los chollos rápido** (anuncios de hace unas horas, no de hace una semana). Usa 130point para contrastar precios. **Le preocupa que el historial de ventas crezca muy despacio** y quiere **más anuncios seguidos → más ventas detectadas → más cartas valoradas**. Ante el riesgo de bloqueo de Vinted eligió un ritmo moderado. **Le gusta aprobar por puntos:** antes de cambios grandes, proponerle la lista numerada y esperar a que diga cuáles sí.

**Objetivo:** por ahora herramienta para él; **en un futuro cercano quiere presentárselo a otra gente**. Enfoque acordado: 1) precisión de alertas medida con los votos; 2) acumular ventas reales de Vinted (el activo principal), **con foto**; 3) catálogo según volumen real (Stadium Club, huecos 21-22/22-23); 4) historial de ventas por carta cuando haya datos. Antes de abrirlo: riesgo legal de Vinted (sus condiciones prohíben el acceso automatizado → presentar sobre todo la parte de valoración; consultar abogado si se cobra), Vercel Hobby es solo uso no comercial (comprobar), límites de Supabase gratis, multiusuario (cuentas, alertas por usuario). Fotos oficiales de Topps/Panini: no copiarlas (derechos); usar fotos de anuncios/ventas reales.

## 2. Dónde está cada cosa

| Pieza | Dónde |
|---|---|
| Web publicada | https://scaard5-analytics.vercel.app |
| Código (GitHub) | https://github.com/scaar5/cardhub-mvp (rama `main`, **público** → Actions sin límite de minutos) |
| Hosting | Vercel, equipo `s-card5-analytics`, proyecto `scaard5-analytics` (Hobby). Cada push a `main` se publica solo (~2 min) |
| Base de datos | Supabase, proyecto "sCaard5 Analytics", ref `scuhirjstndmhgfavbim`. Tablas `deals`, `sets`, `cards`, `listings`. Migraciones en `supabase/migrations/` (hasta **008**, todas ejecutadas a mano por el usuario) |
| Fotos | Supabase Storage, bucket público **`ventas`** (creado por la migración 006). Ruta `vinted/<id>.webp` (miniatura WebP ≤400 px, ~25 KB). URL pública: `photoPublicUrl()` en `lib/photo-url.ts` |
| Alertas | Bot de Telegram propio del usuario ("sCaard5 alertas"). **Webhook** conectado a `/api/telegram/webhook` (solo `callback_query`) |
| GitHub Actions | **`vinted-live.yml`** (cron `7 * * * *`, `concurrency: vinted-live` sin cancelar; cada run hace pasadas de Vinted cada `EVERY_MINUTES=15` durante `LOOP_MINUTES=110`, así siempre hay uno en marcha aunque GitHub retrase el cron; si Vinted da 403/429 espera 30 min) · `sniper.yml` (`*/30`; en la práctica ~1/hora): 1 `/api/sniper` (eBay.es por colección) → 1b `/api/ebay-targeted` (eBay ES+DE por jugador + producto) → 2 Vinted chollos **solo si se lanza a mano** (útil para una pasada de prueba con log inmediato) · **`vinted-sold.yml` (desde el paso 29: continuo, cron `37 * * * *`, `concurrency: vinted-sold`, `LOOP_MINUTES=110`, lotes de `BATCH=100`, `PAUSE_MS=7000` (+0–2 s) → ~400 anuncios/hora; primero ≥10 €, y entre ellos los de `checked_at` más antiguo; no repite los mirados hace <3 h; si 403/429 espera 30 min; + fotos de ventas)** · **`vinted-probe.yml`** (a mano, diagnóstico: vinted.es páginas 1–5 + vinted.fr/.it/.de página 1 de cada búsqueda → rama `vinted-probe`, archivo `probe.json` con `count`, `samples`, `items[{src,id,attr,q,set,host}]`; ~176 peticiones, ~27 min; no toca la base) · `catalog-import.yml` (a mano) · `ebay-sold.yml` (a mano, eBay bloquea) · `checklist-fetch.yml` (a mano, input opcional `slugs`) · `vinted-dump.yml` (a mano: títulos de Vinted → rama `vinted-raw`) · `reference-check.yml` (a mano, inputs `card`/`parallel` → `/api/reference`) · **`admin.yml`** (a mano, input `action`: `telegram-setup` · `deals-recheck` (solo enseña) · `deals-recheck-apply` · `feedback`) |
| Datos de eBay | eBay Browse API, solo `priceCurrency:EUR`, solo anuncios activos. `searchEbay(q, {market, offset})` y `searchEbayMarkets()` en `lib/ebay.ts` (`EBAY_EUR_MARKETS = [EBAY_ES, EBAY_DE]`; si España llega a 200, pide la 2.ª página). Límite ~5.000 llamadas/día; ~35 (sniper) + ~60 (targeted) por pasada (+4–8 por cada uso de "Valorar"). `/api/vinted` no llama a eBay (solo lee referencias de la base) |

Stack: Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase JS · TypeScript · `sharp` (miniaturas, dependencia directa desde el paso 24).

## 3. Variables y secretos (solo nombres)

**Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALERT_SECRET`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (todas ✅).
**GitHub Actions secrets:** `ALERT_SECRET` ✅ (idéntico al de Vercel).
- La clave del webhook de Telegram se deriva de `ALERT_SECRET` (`webhookSecret()` en `lib/telegram.ts`). **Si se cambia `ALERT_SECRET`, volver a lanzar `admin.yml` → `telegram-setup`.**
- Las variables de Vercel solo se aplican tras un **Redeploy**. Comprobación rápida: `GET /api/health`.

## 4. Qué se hizo, en orden

1–11. Historial: Supabase, Telegram, sniper eBay, valorador, rediseño, filtros, catálogo v0.4–v0.6, Vinted.
12. **v0.7 · Catálogo gama alta, fase 1** (`45e605a`): Chrome/Merlin/Finest UCC 21-22 → 25-26. Migración 004.
13. **v0.8 · Referencia en cascada** (`305a550`) — `resolveReference()`: 1 exacta → 2 colección hermana → 3 misma carta, numeración cercana.
14. **v0.9 · Ventas de Vinted** (hasta `7caab96`): `can_buy=false` sin reservado/oculto → `listings.platform = vinted_sold`. Referencia: ventas Vinted (≥2 en 90 días, mediana) antes que eBay. eBay.es vendidos y 130point bloqueados desde Actions y Vercel.
15. **v0.10 · Catálogo completado** (`e704f7e`): +2.384 cartas (→ 10.810). Método `checklist-fetch` (checklistinsider.com → rama `checklists-raw` → fusión local). **Sin revisar contra fuente:** Chrome/Finest/Merlin UCC 21-22 y 22-23 (⚠️ huecos reales confirmados, p. ej. Finest UCC 22-23 sin Bruno Fernandes #108), Finest PL 25-26 y Prizm WC 2022 (sin firmas).
16. **Ventas de Vinted verificadas** (venta `10670138525` confirmada por el usuario). El 429 de Vinted salta por velocidad (5–7 s entre peticiones). `761390e`: cron `13,43` → 120/hora.
17. **Reconocedor +54 %** (`70d8faa`): con 1.778 anuncios reales (rama `vinted-raw`), 408 → 628 reconocidos, 0 perdidos. Título sin competición (`weak`, exige número o club si la marca tiene UCC y PL esa temporada); año suelto como año de salida (tier 2); apellido + club; `NAME_ALIASES`, `TEAM_ALIASES`; carta firmada solo si el título dice auto; filtros "set N", "lotto", "graduado", "sollys".
18. **Referencias a medida en eBay** (`8efed81`): `/api/ebay-targeted` busca "jugador + producto" (sin temporada) para las cartas vistas en Vinted sin referencia exacta, rotando. Nivel 3 de la cascada solo si la numeración se parece (ratio ≤ 1,6). "topps chrome" rinde poco en eBay (≈20/200); merlin/finest 85–130/200.
19. **Referencias de eBay más prudentes**. Caso: Luka Romero Merlin 21-22 Purple /275 a 4 € frente a 32 €. `EBAY_MIN_SAMPLE = 3`; con ≥4 anuncios, **percentil 25**; `EXTREME_PCT = 70` + `EXTREME_MIN_SAMPLE = 6`; "firmado"/"autografiado" = auto. Diagnóstico `/api/reference` + `reference-check.yml`.
20. **Botones de voto, limpieza y mínimo de 10 €** (`86b759b`, 6-nov 23:55):
    - Migración **005** (ejecutada): `deals.feedback` ('bueno'/'falso'), `feedback_at`, `ref_source`, `ref_sample`, `ref_level`.
    - Alertas con botones (`feedbackButtons`, `callback_data = fb:<voto>:<external_id>`). `/api/telegram/webhook` verifica la cabecera secreta y que el chat sea `TELEGRAM_CHAT_ID`, guarda el voto y marca el botón (se puede cambiar). Webhook conectado con `/api/telegram/setup` ✅.
    - `lib/deals.ts` → `judgeDeal()`: reglas comunes (sin referencia, `MIN_REF_VALUE = 10 €`, descuento < 25 %, extremos).
    - `/api/deals-recheck`: vuelve a juzgar los chollos guardados (no toca los votados). **Aplicado:** de 42 chollos se borraron 38 y quedan 4.
    - `/api/feedback`: resumen de votos (ver sección 0).
21. **v0.11 · "Valorar" con el sistema de las alertas** (`9789946` + `df34bf6`, 7-nov 00:30). Bug: "Topps Chrome Jude Bellingham Rookie /299" a 100 € → la web decía 9,90 € (búsqueda libre en eBay). Nuevo `lib/valuation.ts` → `valuate(db, title, query?)`: 1) `recognize()`; 2) `loadReferences` + `resolveReference`; 3) si no hay nivel 1, búsqueda en directo en eBay "jugador + producto" (y antes "+ N" si es numerada), guarda en `listings` y recalcula; 4) si no hay referencia o la carta no está en el catálogo: búsqueda de texto estricta (misma numeración, mismas palabras importantes) → `approximate`; 5) si nada da ≥ `EBAY_MIN_SAMPLE` → sin precio + motivo. `/api/valorar` devuelve `card`, `source`, `sample`, `level`, `comparables` (≤30), `verdict`, `reason`. Resultado según el usuario: "medio funciona"; pocos comparables.
22. **`vinted-sold` más rápido** (`c82b00a`, `115ed36`, 7-nov 00:35): primero los de ≥10 €, `CHECK_BATCH = 75`, cron `3,23,43`. **Resultado noche 6→7-nov:** sin 429, 8 pasadas (GitHub las lanza ~cada hora, no cada 20 min), **1 venta** en total. Límite: hay pocos anuncios seguidos (~716) y de noche se vende poco.
23. **eBay de otros países** (`ba7a8a6`, `4b7ff74`, 7-nov 10:00). Revisión previa: 1 voto (✅ Dumfries Prizm WC /99), 0 ❌.
    - `lib/ebay.ts`: `searchEbay` acepta `market` y `offset`; `searchEbayMarkets()` lanza la búsqueda en varios mercados en paralelo y quita duplicados (prioridad España).
    - **Medido:** EBAY_IT repite ~95 % de EBAY_ES → descartado. Lo nuevo sale de **Alemania** y de la **2.ª página de España**. Mercados finales: **ES (+2.ª página) + DE**.
    - `ebay-targeted`: 22 búsquedas por pasada (≈60 llamadas), rotación por hora, informe `by_market`. **Resultado:** 3.650 referencias guardadas en una pasada frente a 1.788 con ES+IT+DE. Rotación completa (≈433 búsquedas): ~20 h.
    - "Valorar" busca también en ES (+2.ª pág.) y DE; cada comparable muestra "eBay ES"/"eBay DE".
    - `/api/sniper` (búsqueda por colección) sigue solo en eBay.es.
24. **Fotos de las ventas** (`1d8522c`, 7-nov 10:00). Planning acordado ese día: semana 1 = no perder datos, semana 2 = alertas creíbles, semana 3 = más referencias (ver sección 6).
    - Migración **006** (ejecutada): `listings.photo_path`, `listings.photo_url` + bucket público `ventas` (1 MB máx., webp/jpeg).
    - `scripts/vinted-sold-check.mjs`: `parsePhotoUrl(html, id)` → `og:image` (funciona; Vinted sirve `.../f800/....webp?s=...`) o, si no, primera foto junto al `item_id`. Para cada venta nueva descarga la foto (≤700 KB va en base64; si no, solo la URL) y la manda en `photos[]`. Además rellena hasta `PHOTO_BATCH = 10` ventas antiguas sin foto (`photo_ids` del GET), con las mismas pausas. Logs: `PHOTO_SAMPLE`, `PHOTO_OLD`, `PHOTOS {...}`; en `ITEM ... sold` aparece `photo: og|item|page|none`.
    - `/api/vinted-sold` POST: `storeSalePhoto()` (`lib/photos.ts`): `sharp` → WebP ≤400 px calidad 72 → Storage `vinted/<id>.webp` → update de `vinted_sold:<id>`. Solo descarga URLs `https://*.vinted.net`. Errores en `photo_errors` sin romper la pasada.
    - Historial de ventas: miniatura en "Ventas de esta carta".
    - **Probado:** `PHOTO_SAMPLE og` correcto y las 2 ventas antiguas con foto (`photos: 2`). 733 anuncios abiertos en seguimiento (340 de ≥10 €).
25. **Chollos cada 15 min + `vinted-sold` por turnos** (`3e6af24`, 7-nov 10:35). Las alertas ya eran solo de anuncios nuevos (upsert `ignoreDuplicates` → solo alerta si se inserta por primera vez); el problema era el retraso (~1 h) del cron de GitHub.
    - **`vinted-live.yml`** (nuevo) + `scripts/vinted-scan.mjs` con modo continuo (`LOOP_MINUTES`, `EVERY_MINUTES`; `scanOnce()` devuelve `{blocked, ok}`; si bloqueo, espera `BLOCK_PAUSE_MIN = 30`). 4–5,5 s entre búsquedas (antes 2,5 s). 22 búsquedas por pasada (~2 min). ≈4× más peticiones a Vinted que antes. Latencia esperada: ~7 min de media, ≤15.
    - `sniper.yml`: el paso de Vinted solo con `workflow_dispatch`.
    - **Probado** (pasada única vía `sniper.yml` a mano): 1.779 anuncios únicos, 625 reconocidos, 125 con referencia (78 exacta, 37 hermana, 10 cercana), 6 chollos, 0 nuevos. Primer run de `vinted-live` lanzado a las 10:35 (run `42360133294`).
    - **Migración 007** (✅ ejecutada): `listings.checked_at timestamptz`. `/api/vinted-sold` GET ordena: ≥10 € primero y dentro, `checked_at` más antiguo (nulos primero; empates al azar). Si la columna no existe, vuelve a la consulta sin ella. POST pone `checked_at = now` a todos los anuncios revisados y devuelve `checked`.
26. **Medición de fuentes de Vinted + reconocedor** (7-nov 11:00–12:00; `vinted-probe` + `d606602`, `58d4a95`). El usuario aprobó los puntos 1 (medir) y 2 (reconocer más) de la propuesta; 3–6 pendientes de decidir con los números.
    - **`vinted-probe` (2.ª ejecución OK; la 1.ª leyó todo pero falló al guardar por `sparse-checkout` → ahora checkout completo). 176 peticiones en ~27 min, 0 errores, 0 bloqueos.** Cada página da ~96 anuncios; páginas 2–5 de vinted.es casi llenas (1.824–2.083 por fuente). Títulos de .fr/.it/.de vienen con etiquetas en su idioma (`Marque:/État:`, `Brand:/Condizioni:`, `Marke:/Zustand:`) → `parseTitleAttr` de `vinted-scan.mjs` solo entiende español: para otros países hay que generalizarlo (regex `(?:, [^,:]{2,20}: [^,]*)*` funciona; 11 de 16.141 sin parsear).
    - **Resultados** (anuncios únicos; "nuevos" = no vistos en las fuentes anteriores de la tabla; reconocidos con el reconocedor nuevo):

      | Fuente | Únicos | Nuevos | Reconocidos nuevos | De ellos ≥10 € |
      |---|---|---|---|---|
      | es pág. 1 (lo que ve hoy el sniper) | 1.779 | — | 643 | — |
      | es pág. 2 | 1.973 | 1.740 | 712 | 280 |
      | es pág. 3 | 1.888 | 1.572 | 704 | 255 |
      | es pág. 4 | 1.780 | 1.468 | 561 | 227 |
      | es pág. 5 | 1.764 | 1.437 | 626 | 256 |
      | fr pág. 1 | 1.801 | 359 | 142 | 89 |
      | it pág. 1 | 1.797 | 11 | 5 | 3 |
      | de pág. 1 | 1.877 | 152 | 51 | 25 |

      Total: 8.518 anuncios únicos, **3.444 reconocidos (1.446 de ≥10 €)** frente a 643 en la pág. 1. Vinted comparte catálogo internacional: .it repite casi todo; .fr aporta algo (~360 nuevos); .de poco. Las páginas 6+ probablemente sigan aportando (la 5 aún daba 1.437 nuevos): no medido.
    - **Reconocedor** (`lib/recognize.ts`): regla **"rookie sin temporada"**: si el título dice RC/rookie y no trae temporada, `rookieNoSeason()` busca en todas las temporadas del producto (`freeSets`, también solo con la marca si esa marca no tiene otra colección esa temporada) **solo cartas rookie** (`pickCard(sets, onlyRookie)`); si sale una única rookie → alta, y además dentro de esa colección sin filtrar tiene que salir la misma carta (evita confundir inserts tipo "Top of the World"/"Wonderkids" con la base). Portugués `assinada/assinado/autografada` = auto. **Medido:** 8.518 anuncios → 3.401 → 3.486 (+85), 0 perdidos, 1 cambio (a la carta firmada correcta); con `vinted-raw` (1.778): 628 → 653.
    - **Qué queda sin reconocer (≥10 €, datos del probe):** lote 470 (bien excluidos), graduada 226 (excluidas a propósito), **colección no reconocida 1.203** (Stadium Club Chrome 158, Bundesliga Chrome 80, Sapphire 60, NBA 65 (bien), Women/UWCL 19, Inception 11, Museum 10, Merlin Heritage, Panini ~104, y títulos sin producto/temporada), **jugador no encontrado 374** (sobre todo autógrafos/inserts/leyendas que no están en el catálogo y huecos 21-22/22-23/24-25, p. ej. Haaland Finest 22-23 #100, Modric/Vini Finest 21-22, Trossard/Tielemans Finest 24-25), media 103, dudoso 62, auto no en catálogo 47. **Conclusión:** el reconocedor ya está cerca de su techo; la ganancia grande ahora está en el **catálogo** (punto 6 de la propuesta).
    - Herramientas de análisis antiguas (fuera del repo): sustituidas por `scripts/dev/compare-recognize.mts` (paso 27).
27. **v0.12 · Catálogo fase 2** (`2acb7de`, 7-nov 13:00). +6.834 cartas → **17.644 en 33 colecciones**; `catalog-import` ✅ (`{"ok":true,"sets":33,"cards":17644}`).
    - **checklistinsider solo tiene estos productos desde 2023-24** (su sitemap no tiene 2021-22/22-23 de ninguno, ni Stadium Club Chrome 24-25, ni Chrome UCC 2020-21). Añadido: Stadium Club Chrome UCC 23-24 (339) y 25-26 (472) · Chrome Bundesliga 23-24 (437), 24-25 (467), 25-26 (572) · Chrome Sapphire UCC 23-24 (341), 24-25 (409), 25-26 (366) · Inception UCC 23-24 (275), 24-25 (431), 25-26 (503) · Museum Collection UCC 23-24 (538), 24-25 (929), 25-26 (755).
    - **Herramientas nuevas (en el repo):** `scripts/dev/add-collection.mjs <raw> <slug> "<Nombre>" "<Competición>" "kw1;kw2" [--rookies] [--keep-variations]` (checklist bruto → `data/catalog/<slug>.txt` + ficha en `sets.json` con las paralelas de la base + valida; salta "Variations" y Team Sets; firmas sin número → número sintético `U<sección>-<n>`). `scripts/dev/compare-recognize.mts snap <nombre>` / `diff <antes> <despues>` (sobre `probe.json`, imprime solo totales, perdidos y cambiados; cache en `.cache/`, ignorada). `checklist-fetch.mjs`: `TARGETS` configurable + input `slugs` del workflow + `SITEMAP.txt` (ojo: cada run **sobrescribe** la rama `checklists-raw`; el sitemap a veces falla → 0 URLs, por eso hay URLs conocidas como candidatas).
    - `lib/set-rules.ts`: `uefaProduct()` (Stadium Club Chrome, Sapphire, Inception, Museum: el título debe decir el producto; si no dice UEFA/UCC es `weak`) y `chromeBundesliga()` (`all: ["bundesliga","chrome"]`; **"bundesliga" primero**, porque `all[0]` es la "marca" para buscar hermanas: con "chrome" primero se perdían 33 anuncios de Chrome UCC). "sapphire" sigue en `OTHER_TOPPS` → Chrome normal lo prohíbe; las reglas nuevas usan `others(...)` para quitarse su propia palabra. Vinted: +5 búsquedas por pasada (una por producto).
    - `lib/recognize.ts`: un color que forma parte del nombre de la colección ("Sapphire") no cuenta como paralela. `ebayProduct()` con los 5 productos nuevos (antes que "topps-chrome-").
    - **Medido (probe, 8.518 anuncios):** 3.486 → **3.718 (+232), 0 perdidos, 0 cambiados.** Nuevos: Stadium Club Chrome 141 (70 de ≥10 €), Bundesliga 48 (25), Sapphire 33 (24), Inception 8 (8), Museum 3 (3). Muestra revisada a mano: correctos.
28. **v0.13 · Temporadas antiguas** (`0c2fdfe`, 7-nov 13:30). El usuario pidió 2020-21 → 2023-24. Fuente: **cardboardconnection.com** (mismo formato que checklistinsider; `checklist-fetch` con `OLD()` = URLs completas, beckett.com/news de reserva). +3.732 cartas → **21.376 en 49 colecciones**; `catalog-import` ✅.
    - Añadido 2020-21, 2021-22 y 2022-23 de Stadium Club Chrome UCC (198/209/258), Chrome Bundesliga (245/252/292), Chrome Sapphire UCC (115/214/250), Inception UCC (133/251/278) y Museum Collection UCC (323/311/356) + **Chrome UCC 2020-21 solo rookies** (47, `--rookies`). Nombres 20-21/21-22 = "UEFA Champions League".
    - **Sigue sin fuente: Stadium Club Chrome UCC 2024-25** (no está en checklistinsider ni cardboardconnection).
    - cardboardconnection no marca RC en Chrome Bundesliga 20-21 y 22-23, ni en Inception 20-21/21-22/22-23 (base sin números → números sintéticos `U…`): la regla "rookie sin temporada" no sirve ahí.
    - `add-collection` entiende "X Set Checklist", "REFRACTOR PARALLELS: a #/99, b" y "Base / Inserts"; los Team Sets cortan la lectura (salvo "Beam Team").
    - **Medido:** 3.718 → **3.851 (+133; +365 desde el inicio del paso 27), 0 perdidos, 0 cambiados.** Nuevos: Bundesliga 21-22 28 · 22-23 42; Stadium Club Chrome 22-23 33 · 21-22 14 · 20-21 1; Sapphire 21-22 7 · 22-23 7; Chrome 20-21 1. Inception/Museum antiguos: 0 en el probe (poco volumen).
    - ⚠️ Visto en la muestra: "Camavinga #FS-12 Future Stars RC Topps Chrome" cae en la rookie base de Chrome 20-21 (los inserts de 20-21 no están en el catálogo). Mismo problema que el de `INSERT_WORDS` (sección 6).

29. **Más anuncios en seguimiento** (`f50a63f`, 7-nov 13:00). Aprobados los puntos 3 y 5 de la propuesta.
    - `scripts/vinted-scan.mjs`: `BACKFILL_PER_PASS` (6 en `vinted-live.yml` y en la pasada manual de `sniper.yml`; 0 = apagado) páginas antiguas por pasada; turno calculado por la hora (`backfillSlice`, sin estado): 27 búsquedas × páginas 2–5 = 108 → vuelta completa ~4,5 h. Se mandan aparte a `/api/vinted` con `backfill: true`: solo se guardan en `listings` (platform `vinted`), **sin chollos ni alertas**; devuelve `deals` y `strong_deals` (cuántos lo habrían sido). Logs `BACKFILL [...]` y `BACKFILL_RESULT {...}`.
    - `scripts/vinted-sold-check.mjs` en modo continuo (`LOOP_MINUTES`, `BATCH`, `PAUSE_MS`; sin `LOOP_MINUTES` = un lote de 75 como antes). `/api/vinted-sold` GET acepta `?limit=` (máx. 200), salta los mirados hace < `RECHECK_HOURS = 3` y devuelve `due`, `never_checked`, `oldest_10_hours`. Si no queda nada pendiente, espera 15 min.
    - **`lib/fetch-all.ts`**: Supabase corta en 1.000 filas aunque se pida `.limit(10000)` → `fetchAll()` pagina. Usado en `/api/vinted-sold` (abiertos y cerrados) y `/api/ebay-targeted` (con >1.000 anuncios se perdían).
    - **Probado** (`sniper.yml` a mano): pág. 1 → 792 reconocidos; 6 páginas antiguas → 576 anuncios, **253 reconocidos nuevos**, 55 con referencia, 3 chollos fuertes (no avisados). Primer `vinted-sold` continuo: run `42370313435`.

30. **Alertas creíbles + eBay Chrome ×4** (`403cb0a` → `d736aef`, 7-nov 19:30–20:15). Aprobados los puntos 0, 1 y 4 de la propuesta de la tarde.
    - **Revisión (punto 0):** `vinted-sold` continuo sin 429: 762 anuncios en 110 min (~415/h), pero la cola crece (open 3.343 → 4.104, `never_checked` ~2.000) porque el repaso de páginas antiguas añade más rápido de lo que se revisa; `oldest_10_hours` sale `null` (sin revisar). `vinted-live` sin bloqueos: 8 pasadas, ~795 reconocidos/pasada, backfill ~13 chollos fuertes en 8 pasadas (sin avisar). Votos: 4 ✅ / 1 ❌.
    - **El ❌:** Mbappé Merlin 24-25 #9 base a 2 € frente a 61,77 € (nivel 2, colección hermana). Nueva regla en `judgeDeal`: **descuento ≥ `EXTREME_PCT` (70 %) con referencia de nivel 2–3 → descartado**.
    - **Foto del chollo:** `scripts/vinted-scan.mjs` → `parseItemPhoto()` saca la foto de la página de resultados (`<img data-testid="product-item-id-<id>--image--img" src="https://images1.vinted.net/t/.../310x430/...webp?s=...">`; probado 2.591/2.591). Solo página 1 (el backfill no la manda). Logs `PHOTOS_PARSED` y `PHOTO_HTML` (trozo de HTML, una vez por run).
    - **Alerta nueva** (`dealAlertHtml` + `sendDealAlert` en `lib/telegram.ts`): HTML de Telegram, `sendPhoto` con pie (si Telegram no puede bajar la foto, `sendMessage` sin foto); precio, referencia con de dónde sale ("N ventas reales en Vinted" / "N anuncios en eBay (precio pedido)"), y **4 comparables con enlace** (ventas: las más recientes; eBay: las más baratas). Recorta comparables si el texto visible pasa de 1.000 caracteres. `loadComparables` (`lib/valuation.ts`) exportada y con `photo_url` (miniatura propia si hay `photo_path`). `/api/vinted` devuelve `alert_photos` y `with_photo`. **Probado:** 1 alerta con foto (19:58).
    - **Migración 008** (✅ ejecutada): `deals.photo_url`, `deals.ref_comps jsonb` (copia de hasta 20 comparables). Si faltara, el update falla en silencio y la alerta sale igual.
    - **eBay Chrome (punto 4).** Causa real del 11–14 %: **eBay ES/DE traduce automáticamente los títulos** ("Topps Cromo", "Zafiro", "Novato", "Púrpura/75", "Competiciones de Clubes UEFA"…) → "colección no reconocida". `lib/ebay-title.ts` → `untranslateEbayTitle()` aplicado en `searchEbay()` (afecta a todo lo de eBay: sniper, targeted, Valorar; el título guardado queda "destraducido"). **Medido:** Chrome 11 % → **58 %** reconocido; `references_saved` 776 → 1.873 por pasada. Las listings de eBay antiguas con título traducido no se recuperan (solo búsquedas nuevas).
    - `ebay-targeted`: búsquedas Chrome con competición `(uefa,ucc,champions)` / `(premier,epl)` y `-psa -bgs -sgc -pca -lot -lote` (si no trae nada, repite la simple; no medido si el `-` funciona en la Browse API); **3/4 de las búsquedas a cartas con algún anuncio de Vinted ≥ 10 €** (`queries_pricey` ≈ 1.018 de 1.870; vuelta completa ~2 días); `report[]` con `why` (motivos) y `samples`.
    - Lo que queda sin reconocer en Chrome: sobre todo autógrafos/inserts fuera del catálogo y "elige tu carta". **Ojo:** los colores en español ("verde /99", "rosa") tampoco los entiende el reconocedor en títulos de Vinted → probar con `compare-recognize` (regla 0 perdidos).

## 5. Plan del catálogo gama alta (acordado)

Licencias: Premier League con Topps **solo 25-26**; Prizm PL e Impeccable de 21-22 a 24-25; **no existe Prizm Euro 2024** → Topps Chrome UEFA Euro 2024 (+ Sapphire); **no existe Select UEFA** tras 2021; "Topps Heritage UEFA" = **Merlin Heritage UEFA**; Bowman = **Bowman Chrome sub-21 (2022)** + "Bowman UEFA Youth League" en Chrome UCC 24-25/25-26. En ultra-lujo, firmas y parches.

- [x] Fase 1 y 1.5.
- [x] **Fase 2 (paso 27), lo que hay en checklistinsider (2023-24 → 2025-26):** Stadium Club Chrome UCC (23-24, 25-26), Chrome Bundesliga, Chrome Sapphire UCC (producto propio), Inception UCC, Museum Collection UCC.
- [x] **Fase 2 · temporadas 2020-21 → 2022-23 (paso 28)** desde cardboardconnection, + rookies de Chrome UCC 2020-21.
- [ ] **Fase 2 · hueco:** Stadium Club Chrome UCC 2024-25 (sin fuente; probar beckett/tcdb o cartas clave a mano). Posible: inserts/firmas de Chrome UCC 2020-21.
- [ ] Fase 2 · pendientes: Chrome Black (UCC + PL 25-26), Merlin Heritage UEFA. Posibles (existen en checklistinsider): Chrome Sapphire Bundesliga 23-24 → 25-26, Inception Bundesliga 24-25, Sapphire UWCL.
- [ ] Fase 3 — Panini: Prizm PL, Select, Donruss / Optic, Impeccable, National Treasures (poco volumen en Vinted: baja prioridad; ~104 anuncios ≥10 € en el probe).
- [ ] Fase 4 — Topps Chrome Euro 2024 (+ Sapphire Euro 2024, está en checklistinsider), Prizm World Cup 2026, Bowman Chrome sub-21.

## 6. Pendiente

### Propuesta del 7-nov (el usuario aprueba por puntos)
1. ~~Medir fuentes (`vinted-probe`)~~ ✅ (paso 26).
2. ~~Reconocer más títulos~~ ✅ (paso 26; +85, techo cerca).
3. ~~Repaso del stock antiguo~~ ✅ (paso 29; páginas 6+ sin medir; alerta de chollos fuertes de páginas antiguas: pendiente de decidir). Texto original: **Repaso lento del stock antiguo (páginas 2–5 de vinted.es)** — los números lo justifican (≈2.600 reconocidos nuevos, ≈1.000 de ≥10 €, ×5 lo de hoy). Idea: en cada pasada de `vinted-live`, además de la pág. 1, ~4 páginas antiguas por turnos (cubre 88 páginas en ~5–6 h, ~20 % más peticiones). Guardar en `listings` (platform `vinted`) **sin alerta** (pendiente que el usuario diga si quiere alerta solo para chollos muy fuertes). Ojo: `/api/vinted` hoy alerta si el chollo se inserta por primera vez → hace falta un flag `noAlert`/`backfill` en el POST. Valorar páginas 6+ (sin medir).
4. **Vinted Francia** — aporta poco (~360 nuevos, 89 reconocidos ≥10 € por pasada); Italia y Alemania casi nada (catálogo compartido). Si se hace: solo `fr`, generalizar `parseTitleAttr`, guardar dominio en `url` y usarlo en `vinted-sold-check` (hoy fija `www.vinted.es/items/<id>`; probablemente el id funciona igual en .es). Pregunta pendiente al usuario: ¿puede comprar desde España anuncios de Vinted Francia? (si no, solo para precios/ventas).
5. ~~`vinted-sold` más rápido~~ ✅ (paso 29). Texto original: **`vinted-sold` más rápido** (modo continuo como `vinted-live`, 5–7 s entre peticiones) — necesario si se aprueba el 3 (de ~733 a varios miles de anuncios seguidos).
6. **Catálogo**: ✅ en parte (paso 27). Queda: huecos de la sección 5, huecos 21-22/22-23/24-25 de Finest, y búsquedas por jugadores top ("yamal topps", "bellingham topps"…).

### Después (planning del 7-nov)
**Semana 2 — alertas creíbles**
- ~~**Alertas con foto + comparables**~~ ✅ en Telegram (paso 30). Falta: página de detalle en la web con `ref_comps` y foto (punto 2 de la propuesta), y la "mejor foto" de cada carta (punto 3).
- (Texto original) **Alertas con foto + comparables:**
   - **Comparables con enlace en Telegram:** reutilizar `loadComparables` de `lib/valuation.ts`. Guardarlas con el chollo (probable migración: `deals.ref_comps jsonb`). Alerta con las 3–4 más parecidas + enlace; página de detalle en la web con todas.
   - **Guardar snapshot**, no solo el enlace: precio, fecha, título, foto.
   - **Foto del chollo:** 1.ª foto del anuncio de Vinted (reutilizar `parsePhotoUrl`/`storeSalePhoto`; o sacar la miniatura de la página de resultados del sniper); alerta con `sendPhoto` (caption ≤ 1.024 caracteres) y foto en la web.
   - **"Mejor foto" de cada carta** (carta + paralela): reconocimiento más fiable → foto más grande/nítida → más reciente. En `cards` o tabla `card_photos`; se reemplaza si llega una mejor. Mostrar en historial y en "Valorar".
- Revisión de votos cada pocos días hasta tener ~20–30 votos.

**Semana 3 — más referencias**
- ~~Mejorar "topps chrome" en `ebay-targeted`~~ ✅ (paso 30, era la traducción automática de eBay). Texto original: Mejorar "topps chrome" en `ebay-targeted` (añadir "uefa"/"ucc" o año: reconoce solo 55–114 de ~470) y saltar nombres de una palabra ambiguos.
- Ver si `with_reference` sube con eBay DE (antes 120–122 de ~628; 125 el 7-nov 10:38). **Si no:** EBAY_GB convirtiendo GBP→€ con `convertedFromValue`.
- Topps Chrome UCC 2020-21 (al menos rookies).

**Aparcado:** Wallapop en el sniper (salvo bloqueo de Vinted), Panini (poco volumen), multiusuario.

### Resto
- [x] **Cola de `vinted-sold` creciendo** (paso 30): decidido por el usuario → **`vinted-sold` solo revisa anuncios de ≥ 10 €** (`MIN_REF_VALUE`); los baratos se siguen guardando pero no se miran (`skipped_cheap` en `QUEUE`). ~1.770 de ≥10 € a ~415/h → vuelta en ~4–5 h. `oldest_10_hours` ahora = el revisado hace más tiempo (ignora los nunca revisados).
- [ ] Colores en español en el reconocedor (Vinted): medir antes con `compare-recognize`.
- [ ] Revisar votos ✅/❌ semanalmente (sección 0) y corregir.
- [ ] Si siguen colándose falsos chollos: coherencia con la base o ahorro mínimo en €.
- [ ] Lotes de 2 cartas que se reconocen como una ("Arda Güler Merlín RC y nuevo fichaje Megacracks Panini", 25 €): el precio no es de una carta. Filtro "y"/"+" + otra marca.
- [ ] Inserts con nombre que no está en `INSERT_WORDS` (p. ej. "Wonderkids") pueden caer en la carta base si el insert no está en el catálogo.
- [ ] Wallapop en el sniper (también como plan B si Vinted bloquea).
- [ ] Historial / analytics de ventas por carta (`vinted_sold`), cuando haya datos (con la mejor foto de cada carta).
- [ ] Firmas de Finest PL 25-26 y Prizm WC 2022.
- [ ] `lib/market.ts`: `estimateMarketValue` ya no se usa (solo `median`, que usan `lib/reference.ts` y `app/ventas`); se puede borrar esa función.
- [ ] Recomendado: 2FA en Vercel y GitHub; cambiar `ALERT_SECRET` (y luego `telegram-setup`); actualizar `actions/checkout` y `actions/setup-node` (aviso Node 20).

## 7. Notas para el siguiente Claude

- **Repositorio en la sesión:** `add_repo` (scaar5/cardhub-mvp, push) → `git clone --depth 1`. `gh auth status` dice que falla, pero `gh api` funciona.
- **Workflows:** `gh workflow run` falla → `gh api -X POST repos/scaar5/cardhub-mvp/actions/workflows/<archivo>.yml/dispatches -f ref=main` (inputs: `-f "inputs[action]=feedback"`); runs con `gh api "repos/scaar5/cardhub-mvp/actions/workflows/<archivo>.yml/runs?per_page=10" --jq '.workflow_runs[]|"\(.id) \(.created_at) \(.conclusion)"'`; job con `gh api repos/.../actions/runs/<run>/jobs --jq '.jobs[0].id'`; logs con `gh api repos/.../actions/jobs/<id>/logs | grep -o '{"ok".*'` (en `vinted-sold`, buscar `TOTAL`, `ITEM`, `PHOTO`, `RESULT`; en `vinted-live`, `Z [20`, `{"ok"`, `FIN`, `Vinted ha`). Los logs solo existen cuando el job ha terminado. Tras un push, esperar ~3 min (Vercel; comprobar con `gh api repos/scaar5/cardhub-mvp/commits/<sha>/status`) antes de lanzar nada.
- **Comandos largos:** el shell corta a los 10 min; para esperar un workflow largo, varios `sleep` de ≤9 min en llamadas separadas.
- **Prueba rápida del sniper de Vinted:** lanzar `sniper.yml` a mano (hace una sola pasada de Vinted con log inmediato); `vinted-live` no sirve para eso (dura ~110 min).
- **Medir el reconocedor:** `npm ci && npm run catalog && npx -y tsx scripts/dev/compare-recognize.mts snap antes` → cambios → `npm run catalog && ... snap despues` → `... diff antes despues`. Baja `probe.json` (rama `vinted-probe`, 8.518 únicos) a `.cache/` la primera vez. Regla: 0 perdidos.
- **Añadir una colección:** `checklist-fetch.yml` (añadir el producto a `TARGETS` en `scripts/checklist-fetch.mjs`; input `slugs` para bajar solo esas) → `git show origin/checklists-raw:<slug>.txt > .cache/raw/<slug>.txt` → `node scripts/dev/add-collection.mjs ...` → regla en `lib/set-rules.ts` → producto en `ebayProduct()` de `lib/valuation.ts` → medir → `tsc` + `build` → push → `catalog-import.yml`.
- **Cambios de esquema:** primero el usuario ejecuta el SQL (en `https://supabase.com/dashboard/project/scuhirjstndmhgfavbim/sql/new`, Ctrl+Enter), **después** se sube el código que lo usa (o se hace el código tolerante a que falte la columna, como en el paso 25).
- **Revisar un chollo raro:** WebFetch del anuncio de Vinted (ojo: el 7-nov WebFetch rechazó vinted.es por allowlist; si falla, sacar datos desde Actions), reconocer el título en local (`npx -y tsx` + `recognize`) para sacar `card_id`/`parallel`, y `reference-check.yml`.
- **Tras cambiar el catálogo:** `catalog-import.yml` a mano y no lanzar el sniper hasta que termine.
- **Probar en local:** `npm ci` → `npm run catalog` (genera `lib/catalog-data.json`, necesario para `tsx`) → `npx tsc --noEmit` → `npm run build`. No hay config de ESLint.
- **Red de la sesión:** el shell no llega a la web publicada, Supabase, Vinted, eBay ni checklists (WebFetch tampoco a la web publicada ni a vinted.es): todo vía GitHub Actions. Las fotos se descargan en Actions y se suben a Storage desde Vercel.
- **`lib/photos.ts` importa `sharp`**: usarlo solo en rutas de servidor; en páginas, `lib/photo-url.ts`.
- **Nunca** pongas `SUPABASE_SECRET_KEY` ni las claves de eBay en variables `NEXT_PUBLIC_`.
- Vercel Hobby: un cron diario como mucho; la programación va por GitHub Actions.
- Vinted no tiene API pública y sus condiciones prohíben el acceso automatizado; el usuario lo sabe y eligió seguir. Si responde 403/429, los scripts paran (o esperan, en `vinted-live`).
