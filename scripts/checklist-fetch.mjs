// Herramienta temporal: descarga checklists de checklistinsider.com (API de WordPress)
// y los guarda como texto plano en out/<slug>.txt. Se ejecuta en GitHub Actions.
import { mkdirSync, writeFileSync } from "node:fs";

const QUERIES = {
  "topps-chrome-ucc-2023-24": "2023-24 Topps Chrome UEFA Club Competitions",
  "topps-chrome-ucc-2024-25": "2024-25 Topps Chrome UEFA Club Competitions",
  "topps-chrome-ucc-2025-26": "2025-26 Topps Chrome UEFA Club Competitions",
  "topps-chrome-premier-league-2025-26": "2025-26 Topps Chrome Premier League",
  "topps-finest-ucc-2024-25": "2024-25 Topps Finest UEFA Club Competitions",
  "topps-finest-premier-league-2025-26": "2025-26 Topps Finest Premier League",
  "topps-merlin-ucc-2024-25": "2024-25 Topps Merlin UEFA Club Competitions",
  "topps-merlin-premier-league-2025-26": "2025-26 Topps Merlin Premier League",
  "panini-prizm-world-cup-2022": "2022 Panini Prizm World Cup",
};
const BAD = /sapphire|logofractor|japan|delight|women|stadium club|knockout|jumbo|update|hongbao|international/i;
const API = "https://www.checklistinsider.com/ci-api/wp/v2/posts";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36" };

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const toText = (html) =>
  decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<h[1-6][^>]*>/gi, "\n## ").replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/tr>|<\/div>/gi, "\n")
      .replace(/<\/td>/gi, " | ")
      .replace(/<[^>]+>/g, "")
  ).split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

mkdirSync("out", { recursive: true });
const index = [];
for (const [slug, q] of Object.entries(QUERIES)) {
  try {
    const r = await fetch(`${API}?search=${encodeURIComponent(q)}&per_page=10&_fields=id,link,title`, { headers: UA });
    const raw = await r.text();
    let list; try { list = JSON.parse(raw); } catch { list = null; }
    if (!Array.isArray(list)) { index.push(`${slug}: HTTP ${r.status} ${raw.slice(0, 200).replace(/\s+/g, " ")}`); continue; }
    const titles = list.map((p) => decode(p.title.rendered));
    const ok = list.filter((p, i) => titles[i].toLowerCase().startsWith(q.toLowerCase()) && !BAD.test(titles[i]));
    index.push(`${slug} <- ${q}\n   candidatos: ${titles.join(" || ")}`);
    if (!ok.length) { index.push("   NINGUNO"); continue; }
    const p = ok[0];
    const full = await (await fetch(`${API}/${p.id}?_fields=content`, { headers: UA })).json();
    const txt = toText(full.content.rendered);
    writeFileSync(`out/${slug}.txt`, `# ${decode(p.title.rendered)}\n# ${p.link}\n${txt}\n`);
    index.push(`   ELEGIDO: ${decode(p.title.rendered)} (${txt.split("\n").length} líneas)`);
  } catch (e) {
    index.push(`${slug}: ERROR ${e.message}`);
  }
  await new Promise((s) => setTimeout(s, 1500));
}
writeFileSync("out/INDEX.txt", index.join("\n") + "\n");
console.log(index.join("\n"));
