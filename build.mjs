// Cardiac Output — static site builder. Zero dependencies. Run: node build.mjs → dist/
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = {
  url: "https://cardiacoutput.uk",
  title: "Cardiac Output",
  tagline: "Cardiothoracic anaesthesia and intensive care, one topic at a time, in the length of a coffee break.",
  apple: "https://podcasts.apple.com/gb/podcast/cardiac-output/id6793434361",
  spotify: "https://open.spotify.com/show/033TYboBYM484sp0j9M81Z",
  podbean: "https://cardiacoutput.podbean.com",
  amazon: "https://music.amazon.com/podcasts/17c62e2d-8e97-4e11-a709-3e57b90964d2",
  rss: "https://feed.podbean.com/cardiacoutput/feed.xml",
  bluesky: "https://bsky.app/profile/cardiacoutput.bsky.social",
  x: "https://x.com/CardiacOutputMC",
  cfToken: "PASTE_TOKEN_HERE",
};

/* ---------- tiny markdown ---------- */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/ -- /g, " — ");
}
function md(src) {
  const lines = src.split("\n");
  let out = [], i = 0;
  const flushP = (buf) => { if (buf.length) { out.push(`<p>${inline(buf.join(" "))}</p>`); buf.length = 0; } };
  let p = [];
  while (i < lines.length) {
    const l = lines[i];
    if (/^::: qa\s*$/.test(l)) {
      flushP(p);
      let j = i + 1, block = [];
      while (j < lines.length && !/^:::\s*$/.test(lines[j])) block.push(lines[j++]);
      out.push(renderQA(block.join("\n")));
      i = j + 1; continue;
    }
    if (/^::: chapters\s*$/.test(l)) {
      flushP(p);
      let j = i + 1, items = [];
      while (j < lines.length && !/^:::\s*$/.test(lines[j])) { if (lines[j].trim()) items.push(lines[j].trim()); j++; }
      out.push(`<details class="chapters"><summary>Chapters</summary><ol class="chapter-list">${items.map((c) => {
        const m = c.match(/^\((\d+:\d+)\)\s*(.*)$/); return m ? `<li><span class="t">${m[1]}</span>${inline(m[2])}</li>` : `<li>${inline(c)}</li>`;
      }).join("")}</ol></details>`);
      i = j + 1; continue;
    }
    if (/^### /.test(l)) { flushP(p); out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; continue; }
    if (/^## /.test(l)) { flushP(p); out.push(`<h2 id="${slug(l.slice(3))}">${inline(l.slice(3))}</h2>`); i++; continue; }
    if (/^> /.test(l)) { flushP(p); let b = []; while (i < lines.length && /^> /.test(lines[i])) b.push(lines[i++].slice(2)); out.push(`<blockquote>${inline(b.join(" "))}</blockquote>`); continue; }
    if (/^[-*] /.test(l)) { flushP(p); let b = []; while (i < lines.length && /^[-*] /.test(lines[i])) b.push(lines[i++].slice(2)); out.push(`<ul>${b.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); continue; }
    if (/^\d+\. /.test(l)) { flushP(p); let b = []; while (i < lines.length && /^\d+\. /.test(lines[i])) b.push(lines[i++].replace(/^\d+\. /, "")); out.push(`<ol>${b.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`); continue; }
    if (!l.trim()) { flushP(p); i++; continue; }
    p.push(l.trim()); i++;
  }
  flushP(p);
  return out.join("\n");
}
function renderQA(block) {
  const qs = block.split(/\n(?=Q: )/).map((s) => s.trim()).filter(Boolean);
  return `<div class="qa">${qs.map((q, n) => {
    const Q = (q.match(/^Q: ([\s\S]*?)(?=\nA: )/) || [])[1] || "";
    const A = (q.match(/\nA: ([\s\S]*?)(?=\nR: |$)/) || [])[1] || "";
    const R = (q.match(/\nR: ([\s\S]*)$/) || [])[1] || "";
    return `<details class="q"><summary><span class="qn">${n + 1}</span>${inline(Q.trim())}</summary>
      <div class="a"><p class="answer">${inline(A.trim())}</p>${R ? `<p class="reason">${inline(R.trim())}</p>` : ""}</div></details>`;
  }).join("")}</div>`;
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

/* ---------- content ---------- */
function parse(file) {
  const raw = readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  for (const line of m[1].split("\n")) { const k = line.indexOf(":"); if (k > 0) meta[line.slice(0, k).trim()] = line.slice(k + 1).trim().replace(/^"|"$/g, ""); }
  meta.slug = meta.slug || slug(meta.title);
  meta.body = m[2];
  meta.number = +meta.number;
  meta.dateObj = new Date(meta.date);
  const tk = meta.body.match(/## Key takeaways\n([\s\S]*?)(?=\n## |$)/);
  meta.takeaways = tk ? tk[1].split("\n").filter((l) => /^- /.test(l)).map((l) => l.slice(2)) : [];
  meta.summary = meta.summary || meta.body.split("\n").find((l) => l.trim() && !/^#|^:::|^-/.test(l)) || "";
  return meta;
}
const episodes = readdirSync("content/episodes").filter((f) => f.endsWith(".md")).map((f) => parse(join("content/episodes", f))).sort((a, b) => b.number - a.number);
const topics = JSON.parse(readFileSync("content/topics.json", "utf8"));
const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/* ---------- layout ---------- */
const mark = `<svg viewBox="0 0 40 22" aria-hidden="true"><path d="M0,14 L8,14 L11,13 L15,14 L17,17 L19,3 L22,19 L24,14 L32,14 L35,11 L38,14 L40,14" fill="none" stroke="#D9262E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const icons = {
  apple: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5.2a3.3 3.3 0 0 1 1.9 6l-.6 6.4a1.3 1.3 0 0 1-2.6 0l-.6-6.4A3.3 3.3 0 0 1 12 7.2Zm0 1.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Zm0-4.3a6.7 6.7 0 0 0-4.7 11.5l.9-1.3a5.1 5.1 0 1 1 7.6 0l.9 1.3A6.7 6.7 0 0 0 12 4.5Z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.3-.5 10 1.1.3.2.4.6.2.9Zm1.2-2.7a.8.8 0 0 1-1.1.3c-2.7-1.7-6.9-2.2-10.1-1.2a.8.8 0 1 1-.4-1.5c3.7-1.1 8.3-.6 11.4 1.3.3.2.5.7.2 1.1Zm.1-2.8C14.6 9 9.3 8.8 6.2 9.7a.9.9 0 1 1-.5-1.8c3.6-1.1 9.5-.9 13.2 1.3a.9.9 0 0 1-1 1.7Z"/></svg>`,
  podbean: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1v-7H5a7 7 0 0 1 14 0h-2v7h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z"/></svg>`,
  rss: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="19" r="2"/><path d="M3 10a11 11 0 0 1 11 11h-3a8 8 0 0 0-8-8Zm0-7a18 18 0 0 1 18 18h-3A15 15 0 0 0 3 6Z"/></svg>`,
  play: `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z"/></svg>`,
};
const subscribe = `<div class="subscribe">
  <a class="btn primary" href="${SITE.apple}" rel="noopener">${icons.apple} Apple Podcasts</a>
  <a class="btn" href="${SITE.spotify}" rel="noopener">${icons.spotify} Spotify</a>
  <a class="btn" href="${SITE.podbean}" rel="noopener">${icons.podbean} Podbean</a>
  <a class="btn" href="${SITE.rss}">${icons.rss} RSS</a>
</div>`;

function page({ title, desc, path, nav, body, depth = 0 }) {
  const r = depth ? "../".repeat(depth) : "";
  const link = (p, label, key) => `<a href="${r}${p}"${nav === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE.url}/${path}">
<meta property="og:image" content="${SITE.url}/assets/og.jpg">
<link rel="canonical" href="${SITE.url}/${path}">
<link rel="icon" href="${r}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${r}assets/style.css">
<link rel="alternate" type="application/rss+xml" title="Cardiac Output" href="${SITE.rss}">
</head>
<body data-root="${r}">
<header class="site-header"><div class="wrap">
  <a class="brand" href="${r}index.html">${mark}<span>Cardiac Output</span></a>
  <nav class="nav" aria-label="Main">
    ${link("episodes/index.html", "Episodes", "episodes")}
    ${link("learn.html", "Learn", "learn")}
    ${link("about.html", "About", "about")}
    <a href="${r}about.html#contact">Contact</a>
  </nav>
</div></header>
<main>
${body}
</main>
<footer class="site-footer"><div class="wrap">
  <p>Cardiac Output is recorded at Wythenshawe Hospital, Manchester. It is free to access, carries no advertising or sponsorship, and neither host takes any income from it.</p>
  <p>For medical education for healthcare professionals. Not clinical advice. Practice described reflects local Wythenshawe practice at the time of recording — always follow your own centre's guidelines.<br>
  <a href="${SITE.bluesky}" rel="noopener">Bluesky</a> · <a href="${SITE.x}" rel="noopener">X</a> · <a href="${SITE.podbean}" rel="noopener">Podbean</a> · <a href="${SITE.rss}">RSS</a> · <a href="https://ecmo.uk" rel="noopener">ecmo.uk</a></p>
</div></footer>
<script src="${r}assets/site.js"></script>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${SITE.cfToken}"}'></script>
</body>
</html>
`;
}

function episodeRow(e, r, full = false) {
  return `<li class="episode" data-title="${esc(e.title)}">
    <span class="date">${fmtDate(e.dateObj)}</span>
    <div>
      <h3><a href="${r}episodes/${e.slug}.html">${esc(e.title)}</a></h3>
      <p class="desc">${inline(e.summary)}</p>
      ${full ? `<p class="meta">${esc(e.topic)}${e.series ? " · " + esc(e.series) : ""}</p>` : ""}
    </div>
    <div class="actions"><span class="dur">${e.duration} min</span>
      <button class="play" aria-label="Play ${esc(e.title)}" aria-pressed="false" data-episode="${esc(e.title)}">${icons.play}</button></div>
  </li>`;
}

/* ---------- pages ---------- */
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/episodes", { recursive: true });
cpSync("assets", "dist/assets", { recursive: true });
cpSync("data", "dist/data", { recursive: true });

const trace = readFileSync("templates/trace.svg", "utf8");

// Home
writeFileSync("dist/index.html", page({
  title: "Cardiac Output — cardiothoracic anaesthesia and intensive care, in 20 minutes",
  desc: "A short-form podcast on cardiothoracic anaesthesia and critical care from Wythenshawe Hospital, Manchester. Tacit knowledge from a national transplant and ECMO centre.",
  path: "", nav: "home",
  body: `
<section class="hero"><div class="wrap">
  <p class="from">From a national transplant and ECMO centre — Wythenshawe Hospital, Manchester</p>
  <h1>Cardiac Output</h1>
  <p class="lede">${SITE.tagline}</p>
  ${subscribe}
</div>${trace}</section>

<section><div class="wrap">
  <div class="section-head"><h2>Latest episodes</h2><a href="episodes/index.html">All ${episodes.length} episodes</a></div>
  <ul class="episodes">${episodes.slice(0, 5).map((e) => episodeRow(e, "")).join("")}</ul>
</div></section>

<section><div class="wrap">
  <h2>The reasoning that never makes it into the textbook</h2>
  <p>Each episode is a 15–25 minute conversation between two consultant cardiothoracic anaesthetists about something you will meet on the unit or in theatre: ECMO, bleeding after bypass, the balloon pump trace at 2am, the transplant that has just arrived. The intended listener is a resident rotating through cardiothoracics for the first time, but the exam-facing episodes are pitched at the Final FRCA and FCICM, and a good number of consultants listen too.</p>
  <p>It is recorded at Wythenshawe, funded by nobody, and interrupted by bleeps more often than we would like. <a href="about.html">Meet the hosts.</a></p>
</div></section>

<section><div class="wrap">
  <div class="section-head"><h2>Read what you heard</h2><a href="learn.html">Browse by topic</a></div>
  <p>Every episode has a written page: the essay, chapter markers, key takeaways, the references we used, and a short set of questions with the reasoning behind each answer. Start with a topic below.</p>
  <ul class="topics">${topics.map((t) => `<li class="topic"><h3><a href="learn.html#${t.id}">${esc(t.name)}</a></h3><p>${esc(t.blurb)}</p><span class="status">${episodes.filter((e) => e.topic === t.name).length} episodes</span></li>`).join("")}</ul>
</div></section>`,
}));

// Episode index
writeFileSync("dist/episodes/index.html", page({
  title: "Episodes — Cardiac Output", desc: "Every episode of Cardiac Output with essays, takeaways, references and questions.",
  path: "episodes/", nav: "episodes", depth: 1,
  body: `<section><div class="wrap">
  <div class="section-head"><h2>Episodes <small>(${episodes.length})</small></h2></div>
  <div class="toolbar"><input type="search" data-filter placeholder="Search episodes — e.g. ECMO, protamine, TOE" aria-label="Search episodes"></div>
  <ul class="episodes" data-episode-list>${episodes.map((e) => episodeRow(e, "../", true)).join("")}</ul>
  ${subscribe}
</div></section>`,
}));

// Episode pages
for (const e of episodes) {
  const idx = episodes.indexOf(e);
  const newer = episodes[idx - 1], older = episodes[idx + 1];
  writeFileSync(`dist/episodes/${e.slug}.html`, page({
    title: `${e.title} — Cardiac Output`, desc: e.summary.slice(0, 160),
    path: `episodes/${e.slug}.html`, nav: "episodes", depth: 1,
    body: `<article class="ep">
<header class="ep-head"><div class="wrap">
  <p class="meta"><a href="../learn.html#${topics.find((t) => t.name === e.topic)?.id || ""}">${esc(e.topic)}</a> · Episode ${e.number} · ${fmtDate(e.dateObj)} · ${e.duration} min${e.series ? ` · ${esc(e.series)}` : ""}</p>
  <h1>${esc(e.title)}</h1>
  <div class="ep-actions">
    <button class="btn primary play-inline" data-episode="${esc(e.title)}">${icons.play} Listen here</button>
    <a class="btn" href="${e.podbean}" rel="noopener">Open on Podbean</a>
    <a class="btn" href="${SITE.apple}" rel="noopener">Apple Podcasts</a>
    <a class="btn" href="${SITE.spotify}" rel="noopener">Spotify</a>
  </div>
  <div class="player-slot"></div>
</div></header>
<div class="wrap ep-body">
  <div class="note">${md(e.body.replace(/## Key takeaways\n[\s\S]*?(?=\n## |$)/, ""))}</div>
  <aside class="ep-side">
    <h3>Key takeaways</h3>
    <ul class="takeaways">${e.takeaways.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>
  </aside>
</div>
<nav class="wrap ep-nav" aria-label="Episode navigation">
  ${older ? `<a href="${older.slug}.html"><small>Previous</small><br>${esc(older.title)}</a>` : "<span></span>"}
  ${newer ? `<a class="next" href="${newer.slug}.html"><small>Next</small><br>${esc(newer.title)}</a>` : "<span></span>"}
</nav>
</article>`,
  }));
}

// Learn
writeFileSync("dist/learn.html", page({
  title: "Learn — Cardiac Output", desc: "Episodes grouped by topic, with essays, references and questions for each.",
  path: "learn.html", nav: "learn",
  body: `<section><div class="wrap">
  <h2>Learn</h2>
  <p>The catalogue arranged by topic rather than by date. Each episode page carries the essay, chapters, key takeaways, references and a handful of questions with their reasoning. Companion pairs (the theatre half and the unit half of a subject) sit together.</p>
  <ul class="topics">${topics.map((t) => `<li class="topic"><h3><a href="#${t.id}">${esc(t.name)}</a></h3><p>${esc(t.blurb)}</p></li>`).join("")}</ul>
</div></section>
${topics.map((t) => { const eps = episodes.filter((e) => e.topic === t.name).sort((a, b) => a.number - b.number); return `
<section id="${t.id}"><div class="wrap">
  <h2>${esc(t.name)}</h2>
  <p>${esc(t.intro || t.blurb)}</p>
  <ul class="episodes">${eps.map((e) => episodeRow(e, "")).join("")}</ul>
</div></section>`; }).join("")}`,
}));

// About
writeFileSync("dist/about.html", page({
  title: "About and contact — Cardiac Output", desc: "Who makes Cardiac Output, why, and how to suggest a topic.",
  path: "about.html", nav: "about",
  body: readFileSync("templates/about.html", "utf8"),
}));

// Search index for client-side filtering
writeFileSync("dist/data/index.json", JSON.stringify(episodes.map((e) => ({ title: e.title, slug: e.slug, topic: e.topic, summary: e.summary, takeaways: e.takeaways, podbean: e.podbean, date: e.date }))));
console.log(`Built ${episodes.length} episodes → dist/`);
