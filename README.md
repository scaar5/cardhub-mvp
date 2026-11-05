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
