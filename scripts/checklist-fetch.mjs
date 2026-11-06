// Herramienta temporal: descarga checklists de checklistinsider.com (API de WordPress)
// y los guarda como texto plano en out/<slug>.txt. Se ejecuta en GitHub Actions.
import { mkdirSync, writeFileSync } from "node:fs";

const CI = "https://www.checklistinsider.com/";
const BK = "https://www.beckett.com/news/";
const DONE = new Set(["topps-chrome-ucc-2023-24","topps-chrome-ucc-2024-25","topps-chrome-premier-league-2025-26","topps-finest-ucc-2024-25","topps-merlin-ucc-2024-25","topps-merlin-premier-league-2025-26"]);
const SLUGS = ["chrome","finest","merlin"].flatMap((b) => ["2021-22","2022-23","2023-24","2024-25","2025-26"].map((y) => `topps-${b}-ucc-${y}`))
  .concat(["topps-chrome-premier-league-2025-26","topps-finest-premier-league-2025-26","topps-merlin-premier-league-2025-26","panini-prizm-world-cup-2022"]);
function candidates(slug) {
  let m = slug.match(/^topps-(\w+)-ucc-(\d{4})-(\d{2})$/);
  if (m) {
    const [, b, y1, y2] = m, y = `${y1}-${y2}`;
    const c = [`${y}-topps-${b}-uefa-club-competitions`, `${y}-topps-${b}-uefa-club-competitions-soccer`, `${y}-topps-${b}-uefa`, `${y}-topps-${b}-ucc`, `${y}-topps-${b}`, `${y}-topps-${b}-chrome-uefa`, `${y}-topps-${b}-uefa-champions-league`, `${y}-topps-${b}-uefa-champions-league-soccer`, `${y}-topps-${b}-uefa-champions-league-club-competitions`];
    return c.map((x) => CI + x);
  }
  m = slug.match(/^topps-(\w+)-premier-league-(\d{4}-\d{2})$/);
  if (m) return [`${m[2]}-topps-${m[1]}-premier-league`, `${m[2]}-topps-${m[1]}-premier-league-soccer`, `${m[2]}-topps-${m[1]}-epl`, `${m[2]}-topps-${m[1]}-premier-league-club-competitions`].map((x) => CI + x);
  return ["2022-panini-prizm-world-cup-qatar", "2022-panini-prizm-fifa-world-cup", "2022-panini-prizm-world-cup-qatar-soccer", "2022-panini-prizm-fifa-world-cup-qatar-soccer", "2022-panini-prizm-world-cup-soccer-cards", "2022-23-panini-prizm-world-cup", "2022-panini-prizm-fifa-world-cup-soccer"].map((x) => CI + x);
}
const URLS = Object.fromEntries(SLUGS.filter((s) => !DONE.has(s)).map((s) => [s, candidates(s)]));
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
      const head = (txt.match(/^## (.+)$/m) || [, ""])[1];
      const brand = slug.split("-")[1];
      const year = (slug.match(/\d{4}/) || [""])[0];
      tried.push(`   título: ${head}`);
      const valid = head.toLowerCase().includes(brand) && head.includes(year) && !/sapphire|logofractor|japan/i.test(head) && txt.includes("## Base Checklist");
      if (r.ok && autos > 0 && valid) {
        writeFileSync(`out/${slug}.txt`, `# ${u}\n${txt}\n`);
        index.push(`${slug}: OK ${txt.split("\n").length} líneas <- ${u}`);
        done = true;
        break;
      }
    } catch (e) { tried.push(`ERR ${e.message} ${u}`); }
    await new Promise((s) => setTimeout(s, 800));
  }
  if (!done) index.push(`${slug}: FALLO\n   ${tried.join("\n   ")}`);
}
writeFileSync("out/INDEX.txt", index.join("\n") + "\n");
console.log(index.join("\n"));
