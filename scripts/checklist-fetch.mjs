// Herramienta temporal: descarga checklists de checklistinsider.com (API de WordPress)
// y los guarda como texto plano en out/<slug>.txt. Se ejecuta en GitHub Actions.
import { mkdirSync, writeFileSync } from "node:fs";

const CI = "https://www.checklistinsider.com/";
const BK = "https://www.beckett.com/news/";
const URLS = {
  "topps-chrome-ucc-2023-24": [CI + "2023-24-topps-chrome-uefa-club-competitions", BK + "2023-24-topps-chrome-uefa-club-competitions-soccer-cards/"],
  "topps-chrome-ucc-2024-25": [CI + "2024-25-topps-chrome-uefa-club-competitions-soccer", BK + "2024-25-topps-chrome-uefa-club-competitions-soccer-cards/"],
  "topps-chrome-ucc-2025-26": [BK + "2025-26-topps-chrome-uefa-club-competitions-soccer-cards/", CI + "2025-26-topps-chrome-uefa-club-competitions-soccer", CI + "2025-26-topps-chrome-uefa-club-competitions"],
  "topps-chrome-premier-league-2025-26": [BK + "2025-26-topps-chrome-premier-league-soccer-cards/", CI + "2025-26-topps-chrome-premier-league-soccer", CI + "2025-26-topps-chrome-premier-league"],
  "topps-finest-ucc-2024-25": [BK + "2024-25-topps-finest-uefa-club-competitions-soccer-cards/", CI + "2024-25-topps-finest-uefa-club-competitions-soccer", CI + "2024-25-topps-finest-uefa"],
  "topps-finest-premier-league-2025-26": [BK + "2025-26-topps-finest-premier-league-soccer-cards/", CI + "2025-26-topps-finest-premier-league-soccer", CI + "2025-26-topps-finest-premier-league"],
  "topps-merlin-ucc-2024-25": [CI + "2024-25-topps-merlin", BK + "2024-25-topps-merlin-uefa-club-competitions-soccer-cards/"],
  "topps-merlin-premier-league-2025-26": [BK + "2025-26-topps-merlin-premier-league-soccer-cards/", CI + "2025-26-topps-merlin-premier-league-soccer", CI + "2025-26-topps-merlin-premier-league"],
  "panini-prizm-world-cup-2022": [BK + "2022-panini-prizm-world-cup-soccer-cards/", CI + "2022-panini-prizm-world-cup-soccer", CI + "2022-panini-prizm-world-cup"],
};
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "accept-language": "en-US,en;q=0.9", accept: "text/html" };

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
for (const [slug, urls] of Object.entries(URLS)) {
  const tried = [];
  let done = false;
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow" });
      const html = await r.text();
      const txt = toText(html.replace(/^[\s\S]*?<body/i, "<body"));
      const autos = (txt.match(/autograph/gi) || []).length;
      tried.push(`${r.status} autos=${autos} ${u}`);
      if (r.ok && autos > 0) {
        writeFileSync(`out/${slug}.txt`, `# ${u}\n${txt}\n`);
        index.push(`${slug}: OK ${txt.split("\n").length} líneas <- ${u}`);
        done = true;
        break;
      }
    } catch (e) { tried.push(`ERR ${e.message} ${u}`); }
    await new Promise((s) => setTimeout(s, 1500));
  }
  if (!done) index.push(`${slug}: FALLO\n   ${tried.join("\n   ")}`);
}
writeFileSync("out/INDEX.txt", index.join("\n") + "\n");
console.log(index.join("\n"));
