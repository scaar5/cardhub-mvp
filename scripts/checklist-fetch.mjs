// Herramienta temporal: descarga checklists de checklistinsider.com (API de WordPress)
// y los guarda como texto plano en out/<slug>.txt. Se ejecuta en GitHub Actions.
import { mkdirSync, writeFileSync } from "node:fs";

const CI = "https://www.checklistinsider.com/";
const BK = "https://www.beckett.com/news/";
// Colecciones a descargar: slug -> palabras que deben salir en la URL del sitemap y en el título.
// Para añadir otras, editar TARGETS (o pasar CHECKLIST_SLUGS="slug1,slug2" para filtrar).
const S5 = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"];
const T = (prefix, seasons, words, cands, bad = "japan|women|logofractor") =>
  seasons.map((y) => [`${prefix}-${y}`, { y, words, bad: new RegExp(bad, "i"), cands: cands.map((c) => `${y}-${c}`) }]);
const UEFA = "(uefa|ucc|champions|club-competitions)";
const TARGETS = Object.fromEntries([
  ...T("topps-stadium-club-chrome-ucc", S5, ["stadium", "chrome", UEFA], ["topps-stadium-club-chrome-uefa-club-competitions", "topps-stadium-club-chrome-uefa-club-competitions-soccer", "topps-stadium-club-chrome-uefa-champions-league", "topps-stadium-club-chrome-uefa-champions-league-soccer", "topps-stadium-club-chrome-uefa"]),
  ...T("topps-chrome-bundesliga", S5, ["chrome", "bundesliga"], ["topps-chrome-bundesliga", "topps-chrome-bundesliga-soccer"], "japan|women|sapphire|logofractor|stadium|flagship"),
  ...T("topps-chrome-sapphire-ucc", S5.slice(0, 4), ["sapphire", UEFA], ["topps-chrome-sapphire-uefa-club-competitions", "topps-chrome-uefa-club-competitions-sapphire", "topps-chrome-sapphire-uefa-champions-league", "topps-chrome-uefa-champions-league-sapphire", "topps-chrome-sapphire-edition-uefa-club-competitions"], "japan|women|bundesliga|premier"),
  ...T("topps-chrome-ucc", ["2020-21"], ["chrome", UEFA], ["topps-chrome-uefa-champions-league", "topps-chrome-uefa-champions-league-soccer", "topps-chrome-uefa"], "japan|women|sapphire|stadium|logofractor|finest|merlin|bundesliga"),
  ...T("topps-inception-ucc", S5.slice(0, 4), ["inception", UEFA], ["topps-inception-uefa-club-competitions", "topps-inception-uefa-champions-league", "topps-uefa-champions-league-inception", "topps-inception-uefa-club-competitions-soccer"]),
  ...T("topps-museum-collection-ucc", S5, ["museum", UEFA], ["topps-museum-collection-uefa-club-competitions", "topps-museum-collection-uefa-champions-league", "topps-uefa-champions-league-museum-collection", "topps-museum-collection-uefa-club-competitions-soccer"]),
].filter(([s]) => !process.env.CHECKLIST_SLUGS || process.env.CHECKLIST_SLUGS.split(",").includes(s)));
const URLS = Object.fromEntries(Object.entries(TARGETS).map(([s, t]) => [s, t.cands.map((c) => CI + c)]));
const okWords = (str, t) => str.includes(t.y.slice(0, 4)) && t.words.every((w) => new RegExp(w, "i").test(str)) && !t.bad.test(str);
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
// Direcciones reales sacadas del sitemap de la web
const SITE = [];
try {
  const idx = await (await fetch(CI + "sitemap_index.xml", { headers: UA })).text();
  const maps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /post|page/i.test(u));
  for (const m of maps) {
    const x = await (await fetch(m, { headers: UA })).text();
    SITE.push(...[...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
} catch (e) { index.push("sitemap ERROR " + e.message); }
index.push(`sitemap: ${SITE.length} urls`);
for (const slug of Object.keys(URLS)) {
  const t = TARGETS[slug];
  const extra = SITE.filter((u) => u.includes(t.y) && okWords(u.replace(CI, ""), t));
  index.push(`${slug} sitemap: ${extra.join(" ")}`);
  URLS[slug] = [...new Set([...extra.map((u) => u.replace(/\/$/, "")), ...URLS[slug]])];
}
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
      const valid = okWords(head.toLowerCase().replace(/ /g, "-"), TARGETS[slug]) && /^## Base[^\n]*Checklist/m.test(txt);
      if (r.ok && valid) {
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
