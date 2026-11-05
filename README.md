# sCARDs — Analytics & Sniper

MVP para valorar cartas/cromos de fútbol (Panini, Topps) y detectar chollos en Vinted/Wallapop con alertas por Telegram.

**Stack:** Next.js (App Router) · Tailwind CSS v4 · Supabase · Telegram Bot API · Vercel

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # opcional: rellena tus claves
npm run dev                  # http://localhost:3000
```

Sin variables de entorno la web funciona en **modo demo** con datos de ejemplo.

## Estructura

```
app/
  layout.tsx            Layout raíz (dark / terminal)
  page.tsx              Dashboard principal
  globals.css           Tailwind + tema terminal
  api/health/route.ts   GET  /api/health   → estado
  api/telegram/route.ts POST /api/telegram → envía alerta
components/             StatusBar, DealsTable
lib/                    Cliente Supabase, tipos, datos demo
supabase/schema.sql     Tabla `deals`
```

## Probar la alerta de Telegram

```bash
curl -X POST https://TU-APP.vercel.app/api/telegram \
  -H "Content-Type: application/json" \
  -H "x-alert-secret: TU_ALERT_SECRET" \
  -d '{"text":"🔥 Chollo de prueba desde sCARDs"}'
```

## Sniper de eBay y valorador (v0.2)

- **Sniper automático** (`/api/sniper`): cada 30 min (GitHub Actions, `.github/workflows/sniper.yml`)
  busca en eBay.es las búsquedas de `lib/config.ts`, calcula el valor de mercado (mediana de
  comparables) y guarda los anuncios con ≥20 % de descuento. Avisa por Telegram si es ≥30 %.
- **Valorador** (`/valorar`): pega un anuncio de Vinted/Wallapop y te dice su valor de mercado
  según eBay.es; si lo guardas y es chollo, te avisa por Telegram.

Vinted y Wallapop no tienen API pública y bloquean el acceso automatizado, así que no se
rastrean: usa sus alertas de búsqueda guardada y el valorador.

### Variables de entorno nuevas (Vercel)

| Variable | Qué es |
|---|---|
| `EBAY_CLIENT_ID` | App ID (Client ID) de producción en developer.ebay.com |
| `EBAY_CLIENT_SECRET` | Cert ID (Client Secret) de producción |
| `SUPABASE_SECRET_KEY` | Secret key de Supabase (`sb_secret_...`) — solo servidor |

### GitHub
Secret del repositorio `ALERT_SECRET` (el mismo valor que en Vercel) para el workflow.

### Base de datos
Ejecuta `supabase/migrations/002_sniper.sql` en el SQL Editor.
