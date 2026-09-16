---
description: Draft a page for each new Cardiac Output episode and open a PR for review
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Bash(cat:*), Bash(ls:*), Read, Write, Edit, Glob, Grep
---

You are adding episode pages to the Cardiac Output podcast website (cardiacoutput.uk), a static site built from Markdown by `node build.mjs`. The hosts are Mike Charlesworth and Calum Downes, consultant cardiothoracic anaesthetists at Wythenshawe. The audience is residents rotating through cardiothoracic anaesthesia and critical care, plus consultants and people revising for the Final FRCA and FCICM. Everything you write goes live under the hosts' names once merged, so accuracy beats flourish.

Optional argument from the user: `$ARGUMENTS` (may be empty, an episode number, or extra instructions such as "only episode 23" or "regenerate 22").

## 1. Find what's new

Run:

```
node scripts/new-episode-prep.mjs --refresh
```

This refetches the Podbean feed, finds episodes with no page in `content/episodes/`, downloads the audio, transcribes it with Whisper (this can take several minutes per episode — let it run) and writes `.cache/new-episodes.json`. Read that manifest. If it lists no episodes, say so and stop.

If `$ARGUMENTS` names a specific episode, restrict yourself to it; if it says "regenerate N", delete the existing `content/episodes/N-*.md` first and treat it as new.

## 2. Learn the house format before writing anything

Read, in this order:

1. The "Adding an episode" / episode format section of `README.md`.
2. `build.mjs` — check which front-matter fields it actually reads (title, number, date, duration, audio, chapters, takeaways, qa, references, tags…) and how chapters and Q&A are structured, so the new file builds.
3. Two existing episode files — pick the most recent and one on a related topic — for voice, length, front-matter shape and how Q&A reasoning and references are laid out.

Match that format exactly. Do not invent new front-matter fields; if you think one is needed, mention it in the PR body instead.

## 3. Write each episode file

For each episode in the manifest, read its transcript (`content/transcripts/NN-slug.txt`) and show notes, then write `content/episodes/NN-slug.md` containing the same sections as existing episodes, typically:

- **Front matter** — title, number, date, duration, audio URL, Podbean link, topic tags from the existing tag set.
- **Essay** — 600–1000 words in the register of the existing essays: what the episode argued, the evidence discussed, the practical points. Written from the transcript, not padded from general knowledge. Where Mike and Calum disagree on air, present both positions rather than resolving them. Use UK spelling and UK drug names.
- **Chapter markers** — 5–8 with `mm:ss` timestamps derived from where topics change in the transcript. If the transcript has no timestamps, distribute markers proportionally across the stated duration and flag them as approximate in the PR body.
- **Key takeaways** — 4–6 short lines for the sidebar.
- **Q&A** — three questions with reasoning, in the style of the existing ones: exam-style, answerable from the episode, reasoning that explains *why* rather than restating the answer.
- **References** — only papers, trials and guidelines actually named or clearly alluded to in the episode. Give full citations you are confident in; if you cannot verify a reference, leave it out rather than guess. Never fabricate a DOI, year or author list.

If there is no transcript for an episode (the manifest field is `null`), write only from the show notes, keep the essay shorter, and say clearly in the PR body that it was written from show notes only.

Accuracy rules: do not state drug doses, target ranges or trial results that are not in the transcript or that you are not sure of. Where the hosts give a number, use their number. If something in the transcript sounds like a mis-transcription of a medical term (Whisper mangles drug and device names), use the correct term and note it in the PR body.

## 4. Verify the build

Run `node build.mjs`. Fix any error the new file causes. Confirm `dist/` now contains a page for each new episode (check the generated HTML briefly for a broken section).

## 5. Open a pull request — never commit to main

```
git checkout -b new-episode/NN-slug        # or new-episodes/YYYY-MM-DD if several
git add content/episodes content/transcripts
git commit -m "Add episode NN: <title>"
git push -u origin HEAD
gh pr create --fill --title "Episode NN: <title>" --body-file <(…)
```

The PR body must include:

- one-paragraph summary of what the page covers
- a **Review checklist** for the hosts: any numbers/doses/trial results stated, any reference you were unsure of, any suspected mis-transcriptions you corrected, whether chapter timestamps are approximate
- a note that the site will show the episode from the feed regardless, and this PR adds the essay/Q&A page

Do not merge. Finish by printing the PR URL and the review checklist in the terminal.
