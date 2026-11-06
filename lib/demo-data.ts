import type { Deal } from "./types";

// Datos de ejemplo: se muestran mientras Supabase no esté configurado o la tabla esté vacía.
export const demoDeals: Deal[] = [
  {
    id: "demo-1",
    title: "Topps Merlin Chrome UCC 23/24 — Lamine Yamal RC #27",
    platform: "wallapop",
    price: 18,
    market_value: 45,
    url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Topps Chrome UCC 23/24 — Bellingham Refractor /199",
    platform: "vinted",
    price: 35,
    market_value: 60,
    url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-3",
    title: "Topps Finest UCC 25/26 — Estêvão Willian Gold Refractor /50",
    platform: "vinted",
    price: 40,
    market_value: 75,
    url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-4",
    title: "Panini Prizm WC 2022 — Messi Silver",
    platform: "wallapop",
    price: 95,
    market_value: 180,
    url: null,
    created_at: new Date().toISOString(),
  },
];
