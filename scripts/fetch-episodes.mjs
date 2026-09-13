// Pulls the Podbean RSS feed and writes data/episodes.json so the site doesn't depend on
// the feed (or a CORS proxy) at page-load time. Run: node scripts/fetch-episodes.mjs
// Requires Node 18+. No dependencies.
import { writeFileSync } from "node:fs";

const FEED = process.env.FEED_URL || "https://feed.podbean.com/cardiacoutput/feed.xml";

const res = await fetch(FEED, { headers: { "user-agent": "cardiac-output-site/1.0" } });
if (!res.ok) { console.error(`Feed fetch failed: ${res.status}`); process.exit(1); }
const xml = await res.text();

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const tag = (src, name) => {
  const m = src.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim() : "";
};
const attr = (src, name, a) => src.match(new RegExp(`<${name}[^>]*\\b${a}="([^"]+)"`))?.[1] || "";
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const episodes = items.map((it) => ({
  title: strip(tag(it, "title")),
  link: tag(it, "link"),
  date: tag(it, "pubDate"),
  description: strip(tag(it, "description") || tag(it, "itunes:summary")),
  audio: attr(it, "enclosure", "url"),
  duration: tag(it, "itunes:duration"),
  episode: tag(it, "itunes:episode"),
  image: attr(it, "itunes:image", "href"),
}));

writeFileSync("data/episodes.json", JSON.stringify({ updated: new Date().toISOString(), episodes }, null, 2));
console.log(`Wrote ${episodes.length} episodes to data/episodes.json`);
