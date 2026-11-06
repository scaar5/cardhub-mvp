# sCARDs — Contexto del proyecto (traspaso)

> Documento para retomar el proyecto en otra conversación con Claude.
> Última actualización: 6 de noviembre de 2026.
> Pasos 1–9: extensión Claude in Chrome. Pasos 10–11: sesión de Claude con el repositorio conectado (push directo a `main`).

## 1. Qué es

**sCARDs** es una web para detectar **chollos de cartas y cromos de fútbol** (Panini, Topps).
- Calcula el **valor de mercado** de una carta con los precios de **eBay España**.
- Un **sniper automático** revisa eBay cada 30 minutos y guarda los anuncios con descuento.
- Una página **"Valorar"** sirve para pegar a mano anuncios de **Vinted y Wallapop** y saber si son chollo.
- Los chollos (≥30 % de descuento) llegan como **alerta por Telegram**.
- Un **catálogo de 5.094 cartas** (11 colecciones de Topps y Panini) en `/cartas`, base para valorar carta por carta.

**Sobre el usuario:** no es programador. Prefiere que Claude lo haga todo y que, cuando tenga que hacer algo él, se le den pasos muy concretos ("pulsa este botón", "pega aquí"). Escribe en español.

## 2. Dónde está cada cosa

| Pieza | Dónde |
|---|---|
| Web publicada | https://scaard5-analytics.vercel.app |
| Código (GitHub) | https://github.com/scaar5/cardhub-mvp (rama `main`) |
| Hosting | Vercel, equipo `s-card5-analytics`, proyecto `scaard5-analytics` (plan Hobby). Cada push a `main` se publica solo |
| Base de datos | Supabase, proyecto "sCaard5 Analytics", ref `scuhirjstndmhgfavbim`. Tablas `deals`, y (tras migración 003) `sets`, `cards`, `listings` |
| Alertas | Bot de Telegram propio del usuario (creado con @BotFather) |
| Ejecución periódica | GitHub Actions: `sniper.yml` (cada 30 min) y `catalog-import.yml` (tras cada despliegue de producción y a mano) |
| Datos de mercado | eBay Browse API oficial (marketplace `EBAY_ES`). **Cuenta de desarrollador pendiente de aprobación** |

Stack: Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase JS · TypeScript.

## 3. Variables y secretos (solo nombres, nunca los valores)

**Vercel → Settings → Environment Variables**

| Variable | Estado | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clave pública (`sb_publishable_…`), solo lectura |
| `SUPABASE_SECRET_KEY` | ✅ | Clave secreta (`sb_secret_…`) para escribir, solo servidor |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token del bot |
| `TELEGRAM_CHAT_ID` | ✅ | ID del chat del usuario |
| `ALERT_SECRET` | ✅ | Contraseña que protege `/api/sniper`, `/api/valorar` y `/api/telegram` |
| `EBAY_CLIENT_ID` | ❌ pendiente | App ID de producción de eBay |
| `EBAY_CLIENT_SECRET` | ❌ pendiente | Cert ID de producción de eBay |

**GitHub → Settings → Secrets and variables → Actions:** `ALERT_SECRET` ✅. Debe tener **exactamente el mismo valor** que en Vercel; se comprobó que coincide.

Importante:
- Las variables de Vercel solo se aplican tras un **Redeploy** (Deployments → ⋯ → Redeploy). A veces Vercel pide un código que envía por email: lo introduce el usuario.
- Comprobación rápida: `GET /api/health` devuelve qué está configurado (`supabase`, `telegram`, `ebay`, `writer`).

## 4. Qué se hizo, en orden

1. **Supabase conectado.** Se creó la tabla `deals` y se pusieron la URL y la clave pública en Vercel. La web pasó de "modo demo" a "conectado".
2. **Telegram configurado.** Bot creado con @BotFather, chat ID obtenido con @userinfobot y token, chat ID y `ALERT_SECRET` añadidos en Vercel.
3. **Decisión sobre Vinted y Wallapop:** **no se rastrean automáticamente.** No tienen API pública y bloquean el acceso automatizado (Wallapop devuelve 403 de CloudFront). Saltarse esa protección se descartó: va contra sus condiciones y puede provocar el bloqueo de la cuenta o de la IP. El usuario eligió la **opción 3**:
   - eBay (API oficial) para el sniper automático y como referencia de precios;
   - Vinted y Wallapop mediante sus propias alertas de búsqueda guardada, más la página "Valorar" de la web.
4. **Código v0.2: sniper de eBay y valorador** (commit `e19fe63`).
5. **Migración de base de datos** ejecutada en Supabase (`supabase/migrations/002_sniper.sql`): plataforma `ebay` permitida, columnas `external_id` (única, evita duplicados) y `query`, y fila de prueba borrada.
6. **App de Claude en GitHub** instalada solo en este repo, para poder hacer push.
7. **GitHub Actions:** secreto `ALERT_SECRET` creado. Hubo un desajuste de contraseña entre GitHub y Vercel; se resolvió poniendo una nueva idéntica en ambos sitios. Ahora la prueba devuelve "eBay no configurado todavía", que es lo esperado.
8. **El sniper no falla sin eBay:** responde `ok` con `skipped`, para que GitHub no envíe emails de error cada 30 min (`f4db3e0`).
9. **Rediseño v0.3** (`0a2eca4`): estilo minimalista tipo Revolut. Tema claro, tipografía Inter (autoalojada con `@fontsource-variable/inter`), tarjeta negra con el "ahorro potencial", cifras en tarjetas blancas y lista de chollos tipo "movimientos bancarios".
10. **Filtros de valoración** (`lib/filters.ts`, commit `4cfd0f9`): lotes, graduadas, réplicas, "elige tu carta" y accesorios no cuentan para el valor de mercado ni se guardan como chollo. "Valorar" avisa si el anuncio pegado es de ese tipo.
11. **Catálogo de cartas v0.4**: 5.094 cartas (base + inserts, sin autógrafos ni paralelos como cartas aparte) de Topps UCC 25-26, Chrome UCC 25-26 y 24-25, Summer Signings 26-27, Match Attax 26-27, Topps Premier League / Chrome / Finest / Merlin 25-26, Adrenalyn XL LaLiga 25-26 y Adrenalyn XL Mundial 2026. Las variantes (Refractor, /99...) NO son cartas aparte: se detectarán en el título del anuncio y se guardarán en `listings.parallel`. Página `/cartas` con buscador. Migración `003_catalogo.sql` (tablas `sets`, `cards`, `listings`; columnas `card_id` y `parallel` en `deals`). Ruta `POST /api/catalog/import` + workflow `catalog-import.yml`.

## 5. Cómo funciona el código

```
app/
  page.tsx                Portada: cifras + lista de chollos (lee Supabase con la clave pública)
  valorar/page.tsx        Página "Valorar un anuncio"
  api/sniper/route.ts     GET  · cabecera x-alert-secret · busca en eBay, guarda y avisa
  api/valorar/route.ts    POST · cabecera x-alert-secret · valora un anuncio (y lo guarda si save=true)
  api/telegram/route.ts   POST · cabecera x-alert-secret · envía un mensaje de prueba
  api/health/route.ts     GET  · estado de la configuración
components/
  StatusBar.tsx           Cabecera con logo y pastillas de estado (eBay / Base de datos / Telegram)
  DealsTable.tsx          Lista de anuncios
  ValorarForm.tsx         Formulario del valorador (recuerda la clave en localStorage)
lib/
  config.ts               BÚSQUEDAS del sniper y umbrales (guardar ≥20 %, alertar ≥30 %, mínimo 8 comparables, precio mínimo 1 €)
  ebay.ts                 Token OAuth (client credentials) y búsqueda en la Browse API, solo "Cómpralo ya" en EUR
  market.ts               Valor de mercado = mediana de precios de comparables, quitando el 10 % más barato y el 10 % más caro
  telegram.ts             Envío de mensajes y formato de la alerta
  supabase.ts             Cliente de solo lectura (clave pública)
  supabase-admin.ts       Cliente con escritura (SUPABASE_SECRET_KEY)
  catalog.ts              Carga el catálogo (lib/catalog-data.json, generado) y búsqueda simple
  filters.ts              Excluye lotes, graduadas, réplicas, "elige tu carta" y accesorios
  auth.ts                 Comprueba x-alert-secret contra ALERT_SECRET (ignora espacios en los extremos)
app/cartas/page.tsx       Catálogo con buscador y filtro por colección
app/api/catalog/import    POST · x-alert-secret · copia el catálogo a Supabase (sets + cards)
data/catalog/*.txt        Listados de cartas, uno por colección ("número|jugador|equipo|RC", secciones "## Subserie")
data/sets.json            Ficha de cada colección: nombre, marca, temporada, palabras clave y paralelos
scripts/build-catalog.mjs Genera lib/catalog-data.json (se ejecuta solo antes de dev y build; valida duplicados)
supabase/schema.sql, supabase/migrations/002_sniper.sql, 003_catalogo.sql
.github/workflows/sniper.yml, catalog-import.yml
```

**Flujo del sniper**, para cada búsqueda de `lib/config.ts`:
1. Pide 100 anuncios a eBay y otros 50 de los más nuevos.
2. Calcula la mediana de precios.
3. Guarda con `upsert` (sin duplicar `external_id`) los nuevos con ≥20 % de descuento.
4. Envía a Telegram los recién insertados con ≥30 %.

Búsquedas actuales: `panini adrenalyn`, `topps chrome futbol`, `panini prizm futbol`, `topps match attax`, `panini megacracks`.

## 6. Pendiente

**Bloqueante**
- [ ] **eBay aprueba la cuenta de desarrollador** (está "pending"). Cuando la apruebe:
  1. En developer.ebay.com → Application Keys → **Production** → Create a keyset. En "Marketplace account deletion", marcar la opción de exención (no se guardan datos de usuarios de eBay).
  2. Copiar **App ID** a `EBAY_CLIENT_ID` y **Cert ID** a `EBAY_CLIENT_SECRET` en Vercel (solo Production basta).
  3. Hacer Redeploy en Vercel.
  4. GitHub → Actions → sniper → **Run workflow** y revisar el log: debe salir `"ok":true` con un `report` por búsqueda.
  5. Probar `/valorar` con un anuncio real.

**Catálogo (pendiente del usuario)**
- [ ] Ejecutar `supabase/migrations/003_catalogo.sql` en Supabase → SQL Editor.
- [ ] GitHub → Actions → catalog-import → Run workflow. Debe responder `{"ok":true,"sets":11,"cards":5094}`.

**Siguiente desarrollo**
- [ ] Reconocedor de anuncios (`lib/catalog-match.ts`): título → colección (palabras clave + temporada) → carta (número o jugador) → paralelo (Refractor, /99...).
- [ ] Sniper por colección: buscar en eBay por colección, guardar TODOS los anuncios reconocidos en `listings` y calcular el valor por carta+paralelo (mediana de sus propios anuncios) en vez de por búsqueda genérica.
- [ ] Ampliar catálogo: Megacracks 25-26 y 26-27, Adrenalyn LaLiga 26-27, Topps UCC 26-27 y Chrome UCC 26-27 cuando salgan sus listados, Finest UCC 25-26, Gold UCC 25-26.

**Después de los primeros resultados**
- [x] Excluir de la valoración lotes, graduadas, réplicas, "elige tu carta" y accesorios (`lib/filters.ts`).
- [ ] Revisar umbrales en `lib/config.ts` con datos reales. Ahora se usan precios *pedidos*, no *vendidos*, así que habrá algún falso chollo.
- [ ] El usuario activa en las apps de Vinted y Wallapop las alertas de búsqueda guardada.

**Recomendado**
- [ ] Activar 2FA en Vercel y GitHub.
- [ ] Cambiar `ALERT_SECRET` por una contraseña más fuerte, porque se compartió en el chat. Hay que cambiarla **a la vez** en Vercel y en el secreto de GitHub, hacer Redeploy y actualizarla en "Valorar" (se guarda en el navegador).

**Ideas opcionales**
- Parte de "Analytics": evolución de precios por carta o jugador.
- Filtros en la lista (plataforma, descuento, búsqueda).
- Modo oscuro o logo propio.

## 7. Notas para el siguiente Claude

- **Hacer cambios en el código:** las sesiones de Claude con el repo conectado (`scaar5/cardhub-mvp`) pueden hacer commit y push directamente a `main`. Sin acceso al repo, entrega un ZIP o los archivos cambiados. El usuario los sube a GitHub y Vercel publica solo. La extensión de Chrome sí puede hacer push, porque la app de Claude está instalada en el repo.
- **Probar sin conocer la contraseña:** lanza el workflow en GitHub Actions y lee el log. `401 No autorizado` significa que la contraseña no coincide entre GitHub y Vercel.
- **Nunca** pongas `SUPABASE_SECRET_KEY` ni las claves de eBay en variables `NEXT_PUBLIC_`.
- **Añadir una colección al catálogo:** crear `data/catalog/<slug>.txt` y su ficha en `data/sets.json`; `npm run catalog` valida. Fuentes que funcionaron con WebFetch: beckett.com/news, checklistinsider.com, cartophilic-info-exch.blogspot.com, diamondcardsonline.com/blog. La terminal no tiene acceso a esas webs.
- Vercel Hobby solo permite un cron diario; por eso la programación cada 30 min va por GitHub Actions.
