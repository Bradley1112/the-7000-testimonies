# Launch checklist

Everything is built. This is the ordered list of what only you can do, because it needs credentials or a browser login.

Known values, already filled in where possible:

| | |
|---|---|
| Repo | `github.com/Bradley1112/the-7000-testimonies` (public, default branch `main`) |
| Supabase | `https://klhmhvidzsoeykxzqzrl.supabase.co` |
| Sender | `the7000testimonies@gmail.com` |

The order matters in one place: **Vercel gives you a URL, and three later steps need that URL.** Do not try to set them earlier.

---

## 1. Push the code

`gh` is not installed, so this cannot be done for you.

```bash
brew install gh && gh auth login
```

The remote was auto-initialised with its own `README.md`, so it has no shared history with the local repo. That makes a normal push fail. The local README is the real one:

```bash
cd ~/the-7000 && git push --force -u origin main
```

`--force` here overwrites a single placeholder README on an otherwise empty repo. Nothing else is lost.

> **The repo is public.** That is fine — no secrets are committed, `.env.local` is gitignored, and public repos get unlimited Actions minutes. But the vetting log reasoning and source list will be world-readable. Make it private in **Settings → General → Danger Zone** if you would rather it were not; you then drop to 2,000 Actions minutes a month, which is still roughly 15× what this job uses.

---

## 2. Supabase

**a. Run the migrations.** SQL Editor → run in order, checking each succeeds:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_seed_vetted_sources.sql
supabase/migrations/0003_vetting_round_2_corrections.sql
```

Confirm it worked:

```sql
select name, country_code, update_cadence from sources where status = 'approved';
-- expect 5 rows: Salt&Light, Thir.st, Jawaban.com, Christianity Malaysia,
--                Christian Daily International (+ Mission Network News = 6)
```

**b. Copy the two keys** into `~/the-7000/.env.local`, replacing `PASTE_ME`.

Project Settings → API keys. Newer projects label these differently:

| Dashboard label | Goes into |
|---|---|
| Publishable (`sb_publishable_…`) *or* anon | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret (`sb_secret_…`) *or* service_role | `SUPABASE_SERVICE_ROLE_KEY` |

The secret key bypasses row-level security. It goes in `.env.local`, Vercel and GitHub Actions secrets — never anywhere a browser can read it.

**c. Create the admin user.** Authentication → Users → **Add user** → `the7000testimonies@gmail.com`, with "Auto Confirm User" ticked.

Self-signup is deliberately disabled in the code, so `/admin` will refuse to send a link until this user exists.

**d. Redirect URLs** — come back to this after step 4.

---

## 3. Brevo

**a. Verify the sender first.** Senders, Domains & Dedicated IPs → Senders → Add a sender → `the7000testimonies@gmail.com`. Click the confirmation link in that Gmail inbox.

Skipping this makes every send fail with a 400. It is the single most common way this stalls.

**b. SMTP & API → API Keys** → Generate → paste into `BREVO_API_KEY`.

> Free tier is **300 emails/day**. That is your subscriber ceiling, not a monthly budget — see the cost table in the README before you outgrow it.

---

## 4. Gemini + Vercel

**a.** Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → `GEMINI_API_KEY` in `.env.local`.

**b.** Test everything locally before deploying anything:

```bash
cd ~/the-7000 && npm run dev          # visit localhost:3000, subscribe with your own address
cd engine && ./.venv/bin/python run_daily.py --dry-run --preview preview.html
```

The dry run builds and stores a real edition but mails only you. Open `preview.html` and read it. This is the moment to judge whether Gemini's tone is right — if it is not, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`, and nothing else changes.

**c.** Import the repo at [vercel.com/new](https://vercel.com/new). Add every variable from `.env.local` under Settings → Environment Variables, **except** set `NEXT_PUBLIC_SITE_URL` to the domain Vercel gives you (e.g. `https://the-7000-testimonies.vercel.app`) rather than localhost.

Deploy. Note the URL — the next three items need it.

---

## 5. Wire up the URL

**a. Supabase** → Authentication → URL Configuration:
- Site URL: `https://<your-vercel-domain>`
- Redirect URLs: add `https://<your-vercel-domain>/auth/callback`

Without this the admin magic link lands nowhere.

**b. Re-check `NEXT_PUBLIC_SITE_URL` in Vercel.** Every confirmation link, unsubscribe link and email banner image is built from it. If it is wrong or missing, subscribers get links to localhost.

**c. Sign in to `/admin`** and confirm the dashboard loads with your source list.

---

## 6. GitHub Actions

Repo → Settings → Secrets and variables → Actions.

**Secrets:**

```
NEXT_PUBLIC_SUPABASE_URL      https://klhmhvidzsoeykxzqzrl.supabase.co
SUPABASE_SERVICE_ROLE_KEY     (the secret key)
NEXT_PUBLIC_SITE_URL          https://<your-vercel-domain>
NEXT_PUBLIC_CONTACT_EMAIL     the7000testimonies@gmail.com
GEMINI_API_KEY                (from AI Studio)
BREVO_API_KEY                 (from Brevo)
EMAIL_FROM_ADDRESS            the7000testimonies@gmail.com
EMAIL_REPLY_TO                the7000testimonies@gmail.com
EMAIL_TEST_RECIPIENT          the7000testimonies@gmail.com
```

**Variables** (not secrets — so you can flip them without rotating anything):

```
DRY_RUN_SEND    true
EMAIL_PROVIDER  brevo
LLM_PROVIDER    gemini
```

Then Actions tab → **Daily edition** → Run workflow, with `dry_run` ticked. It should finish in 2–4 minutes and upload `edition-preview.html` as an artifact. Download and read it.

---

## 7. Go live

Only after you have read two or three real editions and are happy with them:

Repo → Settings → Variables → set `DRY_RUN_SEND` to `false`.

The next 07:00 SGT run mails your confirmed subscribers. Nothing before that can.

---

## Things worth knowing

**Supabase free projects pause after ~7 days of inactivity.** The daily job keeps it awake once running, but if you set this up and then leave it a fortnight, the project will need waking from the dashboard.

**The first edition may be Singapore-only.** That is expected, not a bug — see the source landscape table in the README. Most days will be Singapore and Indonesia.

**Indonesian summaries are translated to English by the model.** Worth spot-checking the first few against the originals, since Jawaban is the only source exercising that path.

**A domain (~$12/year) is the highest-leverage upgrade.** It unlocks Resend (better deliverability), inbound reply parsing into the feedback inbox, and a sending identity that is not a Gmail address. Everything is already structured so switching is a config change: set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY`, nothing else.

**Email replies are not ingested.** They reach the Gmail inbox; the admin feedback panel shows site comments only. This needs a domain.
