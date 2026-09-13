/* Cardiac Output — site script. Edit CONFIG; the rest should just work. */
const CONFIG = {
  feedUrl: "https://feed.podbean.com/cardiacoutput/feed.xml",
  corsProxy: "https://api.allorigins.win/raw?url=",
  formEndpoint: "",                      // e.g. https://formspree.io/f/xxxxxxxx — blank falls back to mailto:
  contactEmail: "hello@cardiacoutput.uk",
};
const ROOT = document.body.dataset.root || "";

/* ---------- audio: map episode titles → mp3 from the cached feed ---------- */
let feedPromise;
function feed() {
  if (feedPromise) return feedPromise;
  feedPromise = (async () => {
    try { const r = await fetch(ROOT + "data/episodes.json", { cache: "no-store" }); if (r.ok) { const d = await r.json(); if (d.episodes?.length) return d.episodes; } } catch (_) {}
    for (const url of [CONFIG.feedUrl, CONFIG.corsProxy + encodeURIComponent(CONFIG.feedUrl)]) {
      try { const r = await fetch(url); if (!r.ok) continue; const doc = new DOMParser().parseFromString(await r.text(), "text/xml");
        return [...doc.querySelectorAll("item")].map((i) => ({ title: i.querySelector("title")?.textContent.trim(), audio: i.querySelector("enclosure")?.getAttribute("url") })); } catch (_) {}
    }
    return [];
  })();
  return feedPromise;
}
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function audioFor(title) { const eps = await feed(); const t = norm(title); return eps.find((e) => norm(e.title) === t)?.audio || eps.find((e) => norm(e.title).startsWith(t.slice(0, 30)))?.audio || null; }

let player;
function getPlayer() { if (!player) { player = document.createElement("audio"); player.controls = true; player.preload = "none"; player.style.width = "100%"; } return player; }
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-episode]");
  if (!btn) return;
  const title = btn.dataset.episode;
  const li = btn.closest(".episode") || btn.closest(".ep-head");
  const slot = li?.querySelector(".player-slot") || li;
  const p = getPlayer();
  const active = btn.getAttribute("aria-pressed") === "true";
  document.querySelectorAll("[data-episode]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  if (active) { p.pause(); p.remove(); return; }
  btn.setAttribute("aria-pressed", "true");
  btn.disabled = true;
  const src = await audioFor(title);
  btn.disabled = false;
  if (!src) { window.open(li?.querySelector("a[href*='podbean']")?.href || CONFIG.feedUrl, "_blank"); return; }
  if (p.src !== src) p.src = src;
  slot.appendChild(p);
  p.play();
});

/* ---------- episode list filter ---------- */
const filter = document.querySelector("[data-filter]");
if (filter) {
  const rows = [...document.querySelectorAll("[data-episode-list] .episode")];
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    rows.forEach((r) => { r.hidden = q && !r.textContent.toLowerCase().includes(q); });
  });
}

/* ---------- contact form ---------- */
const form = document.querySelector("form.contact");
if (form) {
  const status = form.querySelector(".form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (!CONFIG.formEndpoint) {
      const subject = encodeURIComponent(`[Cardiac Output] ${data.get("type")}: ${data.get("topic") || ""}`);
      const body = encodeURIComponent(`${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`);
      location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${body}`; return;
    }
    status.textContent = "Sending…"; status.classList.remove("error");
    try { const r = await fetch(CONFIG.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" } }); if (!r.ok) throw 0; form.reset(); status.textContent = "Sent. Thanks — we read everything."; }
    catch (_) { status.classList.add("error"); status.textContent = `Couldn't send. Email us instead at ${CONFIG.contactEmail}.`; }
  });
}
