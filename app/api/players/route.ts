import { NextResponse } from "next/server";
import { cardSet, searchPlayers } from "@/lib/players";

/** Autocompletado del buscador de jugadores: GET /api/players?q=yam */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = searchPlayers(q, 8).map((p) => {
    const seasons = [...new Set(p.cards.map((c) => cardSet(c).season))].sort();
    return {
      slug: p.slug,
      name: p.name,
      team: p.teams[p.teams.length - 1] ?? null,
      cards: p.cards.length,
      rookie: p.rookie,
      seasons: seasons.length ? `${seasons[0]}${seasons.length > 1 ? ` → ${seasons[seasons.length - 1]}` : ""}` : "",
    };
  });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=300" } });
}
