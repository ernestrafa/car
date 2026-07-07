# The Longest Road — Catan Record Book

A public website for tracking your Catan group's games: who played, setup
pick order, final standings, full game history, and stats (leaderboard +
"does pick order matter?").

## What's in here

- `index.html` — the entire website (no build step needed)
- `api/data.js` — a Vercel serverless function that saves your dataset to
  a free Upstash Redis database, so the whole group shares one record book
- `vercel.json` — config (nothing to change)

If no database is connected yet, the site still works — it just saves on
each person's own device instead of sharing (you'll see "Saved on this
device only" under the title).

## Deploy to Vercel (5 minutes)

### Option A — Vercel CLI (fastest)

```bash
cd catan-tracker
vercel          # answers: set up new project, accept defaults
vercel --prod   # gives you the public URL
```

### Option B — GitHub + Vercel dashboard

```bash
cd catan-tracker
git init
git add .
git commit -m "Catan tracker"
gh repo create catan-tracker --public --source=. --push
```

Then on vercel.com: **Add New → Project → import catan-tracker → Deploy.**
No framework preset or build settings needed — it's a static site with one
API function.

## Turn on shared cloud data (recommended)

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database → Upstash (Redis)** → free plan → connect it
   to this project. Vercel adds the environment variables automatically.
3. Redeploy (Deployments → ⋯ → Redeploy).

The badge under the title switches to **"Cloud sync on — shared with your
group"**, and now everyone who opens your URL sees and updates the same
dataset.

## Heads up

- Anyone with the URL can view and log games. For a friend group that's
  usually fine (and convenient) — just don't post the link publicly if you
  care.
- The **Full data** view in History has a **Copy CSV** button for pulling
  the raw dataset into Excel or Google Sheets.
