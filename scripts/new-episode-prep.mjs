#!/usr/bin/env node
// new-episode-prep.mjs
// Finds episodes in the Podbean feed that have no page in content/episodes/,
// downloads the audio, transcribes it locally with Whisper, and writes a
// JSON manifest that the /new-episode Claude Code command reads.
//
// Usage:  node scripts/new-episode-prep.mjs            # all missing episodes
//         node scripts/new-episode-prep.mjs --refresh  # refetch feed first
//         node scripts/new-episode-prep.mjs --no-transcribe
//
// Feed fields (from scripts/fetch-episodes.mjs): title, link, date, description, audio, duration, episode, image
// Episode front matter: number, title, date (YYYY-MM-DD), duration (minutes), topic, series, podbean, summary
//
// Env:    WHISPER_MODEL   default "small.en"  (medium.en is better on drug names, ~3x slower)
//         TRANSCRIBER     "whisper" (openai-whisper CLI) | "whisper-cli" (whisper.cpp) | "mlx" (mlx_whisper)
//         WHISPER_CPP_MODEL  path to ggml model, only for whisper-cli
//
// Outputs:
//   .cache/audio/NN-slug.mp3
//   content/transcripts/NN-slug.txt
//   .cache/new-episodes.json   <- manifest read by the slash command

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const EPISODES_DIR = path.join(ROOT, "content", "episodes");
const TRANSCRIPTS_DIR = path.join(ROOT, "content", "transcripts");
const CACHE = path.join(ROOT, ".cache");
const AUDIO_DIR = path.join(CACHE, "audio");
const DATA_FILE = path.join(ROOT, "data", "episodes.json");
const MANIFEST = path.join(CACHE, "new-episodes.json");

const args = new Set(process.argv.slice(2));
const TRANSCRIBE = !args.has("--no-transcribe");

for (const d of [TRANSCRIPTS_DIR, AUDIO_DIR]) mkdirSync(d, { recursive: true });

// ---------- 1. Load the feed ----------
if (args.has("--refresh") || !existsSync(DATA_FILE)) {
  console.log("Refreshing feed via scripts/fetch-episodes.mjs …");
  execSync("node scripts/fetch-episodes.mjs", { cwd: ROOT, stdio: "inherit" });
}
let raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
// episodes.json may be an array or { episodes: [...] } / { items: [...] }
let feed = Array.isArray(raw) ? raw : raw.episodes ?? raw.items ?? [];
if (!feed.length) fail("No episodes found in data/episodes.json");

// Normalise whatever field names fetch-episodes.mjs used.
const pick = (o, ...keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== "");
const eps = feed.map((e) => ({
  title: pick(e, "title", "name") ?? "",
  audio: pick(e, "audio", "audioUrl", "enclosure", "mp3", "url", "link")?.url ?? pick(e, "audio", "audioUrl", "enclosure", "mp3", "url"),
  date: pick(e, "date", "pubDate", "published", "publishedAt", "isoDate") ?? "",
  description: stripHtml(pick(e, "description", "summary", "content", "showNotes", "notes") ?? ""),
  duration: pick(e, "duration", "itunes:duration") ?? "",
  guid: pick(e, "guid", "id", "link") ?? "",
  number: Number(pick(e, "number", "episode", "itunes:episode")) || null,
  link: pick(e, "link", "page", "podbeanUrl") ?? "",
}));

// Oldest first so several new episodes get sequential numbers.
eps.sort((a, b) => new Date(a.date) - new Date(b.date));

// ---------- 2. Work out which are missing ----------
const existing = readdirSync(EPISODES_DIR).filter((f) => f.endsWith(".md"));
const existingNums = existing.map((f) => Number(f.match(/^(\d+)-/)?.[1])).filter(Boolean);
let nextNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;

// An episode counts as "present" if its Podbean link matches the `podbean:` front-matter
// line of an existing file, or its title matches the `title:` line. (Filenames use short
// hand-written slugs like 19-cpb.md, so we don't match on the feed title's slug.)
const fm = existing.map((f) => {
  const src = readFileSync(path.join(EPISODES_DIR, f), "utf8");
  const get = (k) => (src.match(new RegExp(`^${k}:\\s*(.+?)\\s*$`, "m"))?.[1] ?? "").replace(/^["']|["']$/g, "");
  return { file: f, podbean: get("podbean").replace(/\/$/, ""), title: get("title").toLowerCase(), number: Number(get("number")) || null };
});
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const missing = [];
for (const e of eps) {
  const link = (e.link || "").replace(/\/$/, "");
  const seen =
    (link && fm.some((x) => x.podbean && x.podbean === link)) ||
    (e.number && fm.some((x) => x.number === e.number)) ||
    fm.some((x) => x.title && norm(x.title) === norm(e.title));
  if (!seen) missing.push({ ...e, slug: slugify(e.title) });
}

if (!missing.length) {
  writeFileSync(MANIFEST, JSON.stringify({ generated: new Date().toISOString(), episodes: [] }, null, 2));
  console.log("Nothing to do — every episode in the feed already has a page.");
  process.exit(0);
}
console.log(`${missing.length} episode(s) without a page:`);
missing.forEach((m) => console.log(`  • ${m.title}`));

// ---------- 3. Download + transcribe ----------
const transcriber = TRANSCRIBE ? detectTranscriber() : null;
const out = [];
for (const m of missing) {
  const num = m.number ?? nextNum++;
  if (m.number && m.number >= nextNum) nextNum = m.number + 1;
  const base = `${String(num).padStart(2, "0")}-${m.slug}`;
  const audioPath = path.join(AUDIO_DIR, `${base}.mp3`);
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${base}.txt`);

  if (!m.audio) {
    console.warn(`  ! No audio URL for "${m.title}" — skipping download`);
  } else if (!existsSync(audioPath)) {
    console.log(`Downloading ${m.title} …`);
    try { await download(m.audio, audioPath); }
    catch (err) { console.warn(`  ! ${err.message} — continuing with show notes only`); }
  }

  if (transcriber && existsSync(audioPath) && !existsSync(transcriptPath)) {
    console.log(`Transcribing with ${transcriber} (${process.env.WHISPER_MODEL ?? "small.en"}) — this takes a few minutes …`);
    runTranscriber(transcriber, audioPath, transcriptPath);
  }

  out.push({
    number: num,
    slug: m.slug,
    file: `content/episodes/${base}.md`,
    title: m.title,
    date: m.date,
    dateIso: isoDate(m.date),
    duration: m.duration,
    durationMinutes: toMinutes(m.duration),
    podbeanLink: m.link,
    audioUrl: m.audio,
    showNotes: m.description,
    transcript: existsSync(transcriptPath) ? `content/transcripts/${base}.txt` : null,
  });
}

writeFileSync(MANIFEST, JSON.stringify({ generated: new Date().toISOString(), episodes: out }, null, 2));
console.log(`\nManifest written to .cache/new-episodes.json`);

// ---------- helpers ----------
function fail(msg) { console.error(msg); process.exit(1); }

function stripHtml(s) {
  return String(s).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').trim();
}

function isoDate(d) { const x = new Date(d); return isNaN(x) ? "" : x.toISOString().slice(0, 10); }
function toMinutes(d) {
  if (!d) return null;
  const parts = String(d).split(":").map(Number);
  const secs = parts.length === 1 ? parts[0] : parts.reduce((a, b) => a * 60 + b, 0);
  return Math.round(secs / 60);
}

function slugify(t) {
  return t.toLowerCase().replace(/^(ep(isode)?\.?\s*\d+[:.\-–]?\s*)/, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function has(cmd) { return spawnSync("which", [cmd]).status === 0; }

function detectTranscriber() {
  const pref = process.env.TRANSCRIBER;
  if (pref) return pref;
  if (has("mlx_whisper")) return "mlx";
  if (has("whisper")) return "whisper";
  if (has("whisper-cli")) return "whisper-cli";
  console.warn("No transcriber found (mlx_whisper / whisper / whisper-cli). Continuing with show notes only.");
  console.warn("Install one:  pip install -U openai-whisper && brew install ffmpeg");
  return null;
}

function runTranscriber(kind, audio, dest) {
  const model = process.env.WHISPER_MODEL ?? "small.en";
  const tmp = path.join(CACHE, "whisper-out");
  mkdirSync(tmp, { recursive: true });
  let r;
  if (kind === "whisper") {
    r = spawnSync("whisper", [audio, "--model", model, "--language", "en", "--output_format", "txt", "--output_dir", tmp, "--fp16", "False"], { stdio: "inherit" });
    if (r.status === 0) writeFileSync(dest, readFileSync(path.join(tmp, path.basename(audio, ".mp3") + ".txt")));
  } else if (kind === "mlx") {
    const mlxModel = model.includes("/") ? model : `mlx-community/whisper-${model.replace(".en", "")}-mlx`;
    r = spawnSync("mlx_whisper", [audio, "--model", mlxModel, "--language", "en", "--output-format", "txt", "--output-dir", tmp], { stdio: "inherit" });
    if (r.status === 0) writeFileSync(dest, readFileSync(path.join(tmp, path.basename(audio, ".mp3") + ".txt")));
  } else if (kind === "whisper-cli") {
    const ggml = process.env.WHISPER_CPP_MODEL;
    if (!ggml) fail("Set WHISPER_CPP_MODEL to the ggml model path for whisper-cli");
    const wav = audio.replace(/\.mp3$/, ".wav");
    if (!existsSync(wav)) spawnSync("ffmpeg", ["-y", "-i", audio, "-ar", "16000", "-ac", "1", wav], { stdio: "inherit" });
    r = spawnSync("whisper-cli", ["-m", ggml, "-f", wav, "-l", "en", "-otxt", "-of", dest.replace(/\.txt$/, "")], { stdio: "inherit" });
  }
  if (!r || r.status !== 0) console.warn(`  ! Transcription failed for ${path.basename(audio)}; the command will fall back to show notes.`);
}
