# Cardiac Output — website

Static site generated from Markdown. No framework, no npm dependencies: `node build.mjs` turns `content/` into `dist/`.

```
content/episodes/*.md   one file per episode — essay, chapters, takeaways, questions, references
content/topics.json     the topic groupings shown on Learn and the home page
templates/              about page and hero SVG
assets/                 style.css, site.js, favicon; add mike.jpg, calum.jpg, og.jpg (1200×630)
data/episodes.json      cached Podbean feed (audio URLs); refreshed by the GitHub Action
scripts/fetch-episodes.mjs
build.mjs               the whole build, ~200 lines, readable
dist/                   generated output — deploy this (git-ignored)
```

## Writing a new episode

Copy any file in `content/episodes/`, bump `number:`, fill in the frontmatter, and write. The format:

```
---
number: 22
title: Episode title as published
date: 2026-09-20
duration: 21
topic: ECMO                      # must match a name in content/topics.json
series: Optional pairing label
podbean: https://cardiacoutput.podbean.com/e/slug/
summary: One sentence for lists and search previews.
---
Essay paragraphs. ## headings and ### subheadings work. **bold**, *italic*, [links](url).

::: chapters
(00:00) Cold open
(01:10) Next section
:::

## Key takeaways
- one per line — these render in the sidebar

## Questions
::: qa
Q: The question
A: The answer
R: The reasoning (rendered as "Why:")
:::

## References
- Author A et al. Title. Journal Year
```

The `## Key takeaways` heading, the `::: chapters` block and the `::: qa` block are the only special syntax. Everything else is ordinary Markdown-lite.

The in-page player matches the episode `title:` against the Podbean feed to find the mp3, so keep the title identical to the one on Podbean.

## Local preview

```
node scripts/fetch-episodes.mjs   # optional: pull audio URLs
node build.mjs
python3 -m http.server 8000 --directory dist
```

## Hosting: Cloudflare Pages

1. Push to GitHub.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git. Build command `node build.mjs`, output directory `dist`, no framework preset.
3. Custom domains: add `cardiacoutput.uk` and `www.cardiacoutput.uk`.
4. Analytics: Cloudflare → Web Analytics → Add site → copy the token into `cfToken` at the top of `build.mjs`.
5. The GitHub Action refreshes `data/episodes.json` every 6 h; the commit triggers a redeploy.

## Domains (Namecheap)

Simplest: move the nameservers for **cardiacoutput.uk** to Cloudflare (Cloudflare lists two when you add the site; paste them into Namecheap → Domain → Nameservers → Custom DNS). Cloudflare then wires the Pages domain automatically.

**cardiacoutput.co.uk** — Namecheap → Domain → Redirect Domain → `https://cardiacoutput.uk`, Permanent (301). Same for `www`.

## Still to fill in

- Cloudflare analytics token (`cfToken` in build.mjs)
- Contact form endpoint (`formEndpoint` in assets/site.js); until then the form opens the visitor's mail client
- Host photos and an `og.jpg` social image in `assets/`
- The essays are the published show notes; the questions were drafted from them and should be reviewed by you both before launch
