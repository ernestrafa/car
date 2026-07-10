# PaRDeS Explorer

Type a pasuk, phrase, question, or Torah topic and get a structured analysis
through the four classical levels of Torah interpretation — **Pshat, Remez,
Drush, and Sod** — from a strictly Orthodox Jewish perspective, grounded in
real sources fetched live from [Sefaria](https://www.sefaria.org).

## How it's grounded (anti-hallucination pipeline)

Every query runs a three-step server-side pipeline in
[`app/api/analyze/route.ts`](./app/api/analyze/route.ts):

1. **Source identification** — Gemini proposes 2–5 candidate Sefaria refs per
   PaRDeS level (`lib/gemini.ts` → `identifySources`).
2. **Validation + fetch** — every proposed ref is checked against Sefaria's
   name-resolution API and, if valid, its real Hebrew/English text is fetched
   (`lib/sefaria.ts`). Any ref that doesn't resolve is silently dropped — this
   is the hallucination filter.
3. **Grounded synthesis** — Gemini is called again with only the real fetched
   texts and instructed to quote *only* from them, verbatim, with exact
   citations (`lib/gemini.ts` → `synthesizeAnalysis`).

Citation links are built from the validated Sefaria URL slug (not from
whatever text the model echoes back), so every "view on Sefaria" link is a
real, working link.

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Add your Gemini API key to `.env.local`:

```
GEMINI_API_KEY=...
```

Get a free key at [Google AI Studio](https://aistudio.google.com/apikey) —
the Gemini API has a genuinely free tier (rate-limited) for the
`gemini-2.5-flash` model this app uses, so no billing setup is required to
run this. No key is needed for Sefaria — its API is free and public.

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  page.tsx              — hero, input, staged loading, results UI
  api/analyze/route.ts  — the 3-step pipeline described above
lib/
  gemini.ts               — the two Gemini calls (identify, synthesize)
  sefaria.ts              — ref validation, text fetching, HTML stripping
  types.ts                 — shared types between server and client
components/
  LevelCard.tsx           — one PaRDeS level card (summary + expandable detail + quotes)
  FunFacts.tsx             — "Hidden Gems" band
  LoadingStages.tsx        — staged loading indicator
  ExampleChips.tsx         — tappable example queries
```

Recent results are cached in the browser's `localStorage`, so re-querying the
same input is instant and doesn't re-hit the API.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ernestrafa/car/tree/claude/pardes-explorer-app-b8xur0/pardes-explorer&env=GEMINI_API_KEY&envDescription=Gemini%20API%20key%20(free%20tier)&envLink=https://aistudio.google.com/apikey)

Or manually:

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, pick this repo, and set **Root
   Directory** to `pardes-explorer`.
3. Confirm the **Framework Preset** is detected as **Next.js** (if the
   project's root directory was changed after initial creation, re-check this
   — it doesn't always re-detect automatically).
4. Add the `GEMINI_API_KEY` environment variable in the Vercel project
   settings (Production and Preview).
5. Deploy.

## Notes

- **Sod** is presented respectfully and at a high level, citing the Zohar and
  kabbalistic concepts as brought down in mainstream seforim. It is never
  presented as practical instruction, and the UI notes that Sod is
  traditionally studied with a rebbe.
- Non-Torah-related input is declined by the model with a polite message
  rather than answered off-topic.
- If a level turns up few or no grounded sources, the UI shows what's real
  rather than padding it out.
- This app uses Google's Gemini API (`gemini-2.5-flash`) instead of Claude
  specifically to run on Gemini's free tier at no cost. Response quality and
  reliability on this specific task (nuanced source-grounded religious-text
  analysis) hasn't been evaluated against Claude — if quality issues come up,
  swapping back to Claude means restoring `lib/claude.ts` from git history and
  pointing `route.ts` at it again.
