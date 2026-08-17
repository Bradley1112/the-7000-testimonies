# The 7000

A daily newsletter collecting real testimonies of God's work across Southeast Asia, named after 1 Kings 19:18 — the answer given to a prophet who was certain he was the only one left.

- **Site** — Next.js on Vercel. Home with email capture and the pixel scroll story, a Sources directory, and a publicly readable Archive.
- **Engine** — a Python job on GitHub Actions that reads the approved sources each morning, summarises what it finds, stores the edition and sends it at 7am Singapore time.
- **Cost** — free tiers throughout, except a few dollars a month of model usage. See [Costs](#costs).

---

## Read this first: what the source landscape is actually like

The vetting round on 2026-08-17 fetched every candidate feed rather than trusting search results, and the finding shapes the whole product:

| Country | Status |
|---|---|
| **Singapore** | Two strong daily/near-daily outlets. Carries most editions. |
| **Indonesia** | One good source, near-daily, Indonesian-language — the translation path. |
| **Malaysia** | One source, publishing roughly monthly. Contributes occasionally. |
| **Regional** | Two supplementary outlets. Low yield, mostly news rather than testimony. |
| Thailand, Vietnam, Cambodia, Laos, Myanmar, Brunei, Timor-Leste | **No qualifying source found.** Omitted entirely, per design. |

So most editions will be Singapore and Indonesia, sometimes only one of them. That is honest, and the engine is built for it: a country with nothing today is simply absent, the subject line names only the countries actually present, and the consolidation prompt is explicitly told not to imply regional breadth when it only has one country's material.

Full reasoning for every decision, including two reversals, is in `source_vetting_log` — see [The vetting log](#the-vetting-log).

---

## Getting it running

**Launching for the first time? Follow [LAUNCH.md](LAUNCH.md)** — an ordered checklist with this project's actual values filled in. The section below is the general reference.

You need four free accounts: Supabase, Vercel, Brevo and Google AI Studio.

### 1. Clone and install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase (database)

Create a project at [supabase.com](https://supabase.com). Then, in the SQL editor, run the three migration files **in order**:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_seed_vetted_sources.sql
supabase/migrations/0003_vetting_round_2_corrections.sql
```

From **Project Settings → API**, copy into `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses row-level security, never prefix it with `NEXT_PUBLIC_`

### 3. Brevo (email)

Brevo's free tier sends 300 emails a day and lets you verify a single individual address as a sender — no domain needed.

1. Sign up, go to **Senders, Domains & Dedicated IPs → Senders**, add `the7000testimonies@gmail.com` and click the verification link.
2. **SMTP & API → API Keys** → create a key → `BREVO_API_KEY`.

> **Why not Resend, which the brief named?** Resend's shared `resend.dev` domain only delivers to the address that owns the account, so it cannot mail a subscriber list until you verify a custom domain. Both adapters are implemented. Once you own a domain, verify it in Resend, set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY`, and nothing else changes.

> **300 emails/day is your real subscriber ceiling.** See [Costs](#costs).

### 4. Google AI Studio (model)

Get a key at [aistudio.google.com](https://aistudio.google.com/app/apikey) → `GEMINI_API_KEY`. The free tier is enough for development and, at this volume, very nearly enough for production.

### 5. The pixel art

Committed to the repo, so nothing is needed for a normal run. To regenerate after editing the sprites:

```bash
node scripts/pixel-art/generate.mjs && node scripts/pixel-art/email-banner.mjs
```

Output is deterministic — re-running without edits produces byte-identical files.

The scroll story uses **Press Start 2P**, self-hosted at `public/fonts/press-start-2p.woff2` and committed to the repo — nothing to download. It is served from our own origin rather than fetched from Google at runtime: one less third-party request, no layout shift, and the story still looks right if `fonts.gstatic.com` is blocked.

### 6. Run it

```bash
npm run dev
```

### 7. The engine

```bash
cd engine
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Prove the plumbing works with no keys and no database:
./.venv/bin/python smoke_test.py --preview preview.html

# A real run, storing the edition but mailing only your own address:
./.venv/bin/python run_daily.py --dry-run --preview preview.html
```

`smoke_test.py` is the first thing to run on a new machine, and the fastest way to tell whether a source has changed its markup.

### 8. Deploy

Import the repo into Vercel. Add every variable from `.env.example` in **Settings → Environment Variables**, with `NEXT_PUBLIC_SITE_URL` set to your real domain.

Then in the GitHub repo, add these under **Settings → Secrets and variables → Actions**:

**Secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `GEMINI_API_KEY`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `EMAIL_TEST_RECIPIENT`

**Variables:** `DRY_RUN_SEND` — leave it `true` until you have read a few real editions, then set `false` to go live.

The workflow runs at 22:45 UTC (07:00 SGT) and can be triggered by hand from the Actions tab. Every run uploads the rendered edition as an artifact, so you can read what went out even if the email looked wrong.

### 9. Admin access

`/admin` uses a Supabase magic link restricted to an allowlist.

1. In Supabase, **Authentication → Users → Add user**, with `the7000testimonies@gmail.com`. Self-signup is deliberately disabled (`shouldCreateUser: false`), so this must exist first.
2. **Authentication → URL Configuration** → add `https://your-domain/auth/callback` to the redirect allowlist.
3. Set `ADMIN_ALLOWED_EMAILS` to that address.

An empty `ADMIN_ALLOWED_EMAILS` denies everyone. That is intentional — a missing variable must never mean "let everybody in".

---

## Managing sources

### Adding one

```bash
cd engine
./.venv/bin/python vet_sources.py \
  --url https://example.org/ --name "Example Outlet" --country TH --apply
```

This fetches the site, gathers real evidence (feed URL, recent headlines with dates, a sample article's extracted text, whether it is server-rendered), hands that to the model, prints the verdict with per-criterion reasoning, and writes the full chain of thought to `source_vetting_log`. With `--apply` it also creates the `sources` row on approval.

Drop `--apply` to get a decision without changing anything.

### Removing or pausing one

One row change in the Supabase table editor:

```sql
update sources set status = 'suspended' where slug = 'christianity-malaysia';
```

The daily job only reads `status = 'approved'`, and the Sources page only shows approved sources. Nothing else needs touching.

### Re-checking everything

```bash
./.venv/bin/python vet_sources.py --recheck
```

Worth doing every few months. Sources go quiet — that is exactly how PCEC was caught.

### Deleting a subscriber's data

```bash
./.venv/bin/python delete_subscriber.py someone@example.com
```

A hard delete. No row remains and the address is not kept on any suppression list.

---

## The vetting log

`source_vetting_log` is an **append-only audit trail**. Re-vetting writes a new row; it never updates an old one. Migration `0003` exists precisely because two round-1 decisions turned out to be wrong, and correcting them by editing history would have destroyed the thing the log is for.

| Column | What it holds |
|---|---|
| `candidate_name`, `candidate_url`, `country_code` | What was assessed |
| `verdict` | `approved` / `rejected` / `needs_recheck` |
| `decided_by`, `model_version` | Which agent decided |
| `criteria` | JSONB: each of the five criteria with `{pass, reasoning, evidence}` — lets you see *which* criterion sank a candidate without reading prose |
| `reasoning` | The full chain of thought, verbatim. Never summarised on write |
| `evidence` | JSONB array of the raw probes the decision leaned on: feed fetches, status codes, item dates |

The five criteria are the brief's four plus `technically_scrapeable`, added because vetting round 1 found an outlet that was editorially the best fit in the region and still unusable.

To review:

```sql
select created_at, candidate_name, verdict, criteria, reasoning
from source_vetting_log
order by created_at desc;
```

The admin page lists decisions and links out; it deliberately does not try to render the reasoning, which runs to several paragraphs each.

**Three worked examples, all real:**

- **PCEC (Philippines) — rejected.** Every reputational signal said approve: the national evangelical umbrella body, 89 member denominations. Its feed's newest item was from October 2022. Dates decide recency, never reputation.
- **Jawaban.com (Indonesia) — rejected, then approved.** Round 1 concluded it was an unscrapeable single-page app. That rested on a URL path I invented myself; when it 404'd to a generic shell, so did a nonsense path, and I read two nonexistent URLs returning the same shell as evidence about the site. It is server-rendered. Indonesia was restored.
- **Christian Aid Mission — rejected.** A legitimate organisation whose RSS feed emits `Equativ Ad Landing Page Donate Button` and `Double Gift Homepage Banner`. A recognised name does not imply a newsroom.

---

## How the daily job chooses

Full commentary is at the top of [`engine/selection.py`](engine/selection.py). In short, each candidate scores out of ~100:

- **Recency (0–40)** — same-day 40, yesterday 34, two days 28, three days 22, then decaying slowly to 5. The early cliff is deliberate: with a 30-day window, a gentle curve would let three-week-old backlog beat this morning's story.
- **Theme fit (0–30)** — testimony vocabulary adds, news vocabulary subtracts. A cheap pre-filter, not the real judgement.
- **Specificity (0–15)** — quotation marks, personal pronouns, name-like tokens in the title: proxies for a story about identifiable people.
- **Source standing (0–15)** — credibility score, minus a penalty for outlets reporting from outside the region.

**The model has the final veto.** Every summarisation prompt can return `NOT_A_TESTIMONY`, and that article is dropped. This is the backstop that catches what keywords get wrong. The first smoke run ranked an event announcement as Malaysia's top story; counter-signals were added, but the veto is what guarantees it never ships.

**Lookback window.** Set to 30 days. Worth knowing what this does and does not buy: because `processed_articles` excludes anything already seen, a long window pays off **once**, at cold start. By the end of the first week you are back to each outlet's real publishing rate. Its lasting value is slow sources — Christianity Malaysia posts roughly monthly, and a 3-day window missed it entirely.

---

## Costs

Everything is free-tier except the model. The real ceilings, in the order you will hit them:

| Service | Free tier | What happens when you outgrow it |
|---|---|---|
| **Brevo** | **300 emails/day** | **The first wall you hit.** 300 confirmed subscribers = 300 emails/day. Their paid plan starts around **$9/month** for 5,000/month, which is *fewer* daily sends than the free tier — check the daily-send limit, not the monthly total, before switching. MailerSend (3,000/month free) and Resend (3,000/month, 100/day) are alternatives, but a custom domain is what really unlocks volume. |
| **Gemini 2.5 Flash** | Generous free tier in AI Studio | The only guaranteed cost. ~10 summaries/day at ~8k input and ~400 output tokens each ≈ **well under $1/month**. Even at 10× the volume it stays in single-digit dollars. Prompt caching is used; the Batch API is not — see below. |
| **Supabase** | 500MB database, 5GB bandwidth | Text-only rows: a year of editions is a few MB. Bandwidth from archive traffic will bite first. Paid tier **$25/month**. Free projects pause after a week of inactivity — the daily job keeps it awake. |
| **Vercel** | 100GB bandwidth/month | Only at real traffic. Pro is **$20/month**. |
| **GitHub Actions** | 2,000 minutes/month | The daily run takes 2–4 minutes: ~120 minutes/month. Not a concern. Public repos are unlimited. |
| **Domain** | — | ~**$10–15/year**, the one cost you already budgeted. Buying it early is what unlocks Resend, proper deliverability, and inbound reply parsing. |

**On the Batch API**, which the brief suggested: it trades latency for roughly 50% off. This job summarises about ten articles a day, so the saving is a few cents a year, against submitting a job, polling for completion and handling partial results inside a window that must land before 7am. Prompt caching is used because it costs nothing in complexity. Revisit batching if volume grows a hundredfold.

**Sensible first upgrade** if this grows: the domain (~$1/month amortised), which unlocks the rest.

---

## Known gaps

Stated plainly rather than buried.

- **Email replies are not ingested.** The brief asked for replies to land in a stored feedback inbox. Inbound parsing needs a custom domain (Cloudflare Email Routing → webhook), which does not exist yet. Replies go to the Gmail address; the admin feedback inbox shows site comments only. The endpoint is straightforward to add once a domain exists.
- **Seven countries have no coverage**, as above.
- **The regional sources are low-yield.** Christian Daily and Mission Network News surface roughly 2 SEA items in 10, mostly persecution and legal news rather than testimony. They are included so the empty countries have some chance of appearing, ranked below local reporting, and labelled on the Sources page. If they mostly contribute news, demote them — do not loosen the newsletter's register to accommodate them.
- **No automated tests.** `smoke_test.py` exercises the pipeline end-to-end against live sources, which catches the failure that actually happens (a source changing its markup). Unit tests for the scorer would be the first thing to add.

---

## Layout

```
src/app/          Next.js routes — home, sources, archive, suggest, admin, API
src/components/   PixelStory (scrollytelling), forms, feedback widget
src/lib/          Supabase clients, edition queries, email templates + provider
engine/           The daily Python job
  run_daily.py      orchestrator
  fetcher.py        RSS + HTML-index discovery, trafilatura extraction
  selection.py      scoring heuristic + cross-source de-duplication
  llm.py            prompts and the single complete() entry point
  email_render.py   the digest email
  vet_sources.py    source discovery and vetting
  smoke_test.py     offline end-to-end check
scripts/pixel-art/  sprite definitions and the SVG/PNG generator
supabase/migrations/  schema, seed, and the round-2 corrections
docs/architecture.md  diagrams
```

---

## For publishers

We summarise and link; we never reproduce full articles. If you publish one of our sources and would like your work handled differently, or removed, write to the address in `NEXT_PUBLIC_CONTACT_EMAIL` and we will act on it. The contact point appears in the site footer and on the Sources page.
