-- The 7000 — initial schema
-- Postgres / Supabase. Apply with: supabase db push  (or paste into the SQL editor)
--
-- Design notes:
--  * Countries are stored as ISO-3166-1 alpha-2 codes in a lookup table rather than an
--    enum, so expanding beyond Southeast Asia later is an INSERT, not a migration.
--  * Everything the daily engine writes is append-only except `sources`, so the
--    archive and the audit trail can never be silently rewritten by a bad run.
--  * RLS is on for every table. The site reads the Archive/Sources with the anon key;
--    the engine writes with the service-role key, which bypasses RLS entirely.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Reference: countries in scope
-- ---------------------------------------------------------------------------
create table countries (
  code          char(2) primary key,             -- ISO-3166-1 alpha-2
  name          text        not null,
  region        text        not null default 'Southeast Asia',
  -- Countries with no approved source are simply omitted from the site and the
  -- daily job. We keep the row so re-vetting later is an UPDATE, not an INSERT.
  in_scope      boolean     not null default true,
  created_at    timestamptz not null default now()
);

insert into countries (code, name) values
  ('SG','Singapore'), ('MY','Malaysia'), ('ID','Indonesia'), ('PH','Philippines'),
  ('TH','Thailand'),  ('VN','Vietnam'),  ('KH','Cambodia'),  ('LA','Laos'),
  ('MM','Myanmar'),   ('BN','Brunei'),   ('TL','Timor-Leste');

-- ---------------------------------------------------------------------------
-- Subscribers — email + subscribe date only, per the privacy constraint.
-- ---------------------------------------------------------------------------
create type subscriber_status as enum ('pending', 'confirmed', 'unsubscribed', 'bounced');

create table subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              citext      not null unique,
  status             subscriber_status not null default 'pending',
  -- Double opt-in. Token is single-use; cleared once confirmed.
  confirm_token      uuid,
  confirm_sent_at    timestamptz,
  confirmed_at       timestamptz,
  -- Stable per-subscriber secret used to build one-click unsubscribe links that
  -- do not require guessing an id. Never expires.
  unsubscribe_token  uuid        not null default gen_random_uuid(),
  unsubscribed_at    timestamptz,
  subscribed_at      timestamptz not null default now()
);

create index subscribers_confirmed_idx on subscribers (status) where status = 'confirmed';
create unique index subscribers_confirm_token_idx on subscribers (confirm_token) where confirm_token is not null;

-- ---------------------------------------------------------------------------
-- Sources — the vetted outlet directory behind the Sources tab.
-- ---------------------------------------------------------------------------
create type source_status as enum ('approved', 'rejected', 'suspended');
-- How we get article lists out of the outlet. Recorded because it decides which
-- code path the scraper takes, and because 'spa_unscrapeable' is a real verdict:
-- an outlet can be editorially perfect and still be unusable without a headless
-- browser (see the Jawaban.com rejection in the vetting log).
create type source_fetch_method as enum ('rss', 'html_index', 'spa_unscrapeable');

create table sources (
  id                uuid primary key default gen_random_uuid(),
  name              text        not null,
  slug              text        not null unique,
  homepage_url      text        not null,
  feed_url          text,                          -- null when fetch_method <> 'rss'
  country_code      char(2)     references countries(code),
  -- Null country_code = regional/multi-country outlet. Articles from these are
  -- attributed to a country per-article at scrape time, not per-source.
  is_regional       boolean     not null default false,
  denomination      text        not null default 'Non-denominational',
  -- Free text like 'daily', 'several times weekly', 'irregular'. Displayed verbatim
  -- on the Sources tab, so it stays human-readable rather than an enum.
  update_cadence    text        not null,
  primary_language  text        not null default 'en',
  -- When true the engine asks the model to translate the summary into English.
  needs_translation boolean     not null default false,
  fetch_method      source_fetch_method not null default 'rss',
  status            source_status not null default 'approved',
  -- Selection tiebreaker + a lever for the owner to demote a noisy outlet by hand.
  credibility_score smallint    not null default 50 check (credibility_score between 0 and 100),
  -- Shown on the Sources tab as the "credibility" evidence links:
  --   [{"label": "About page", "url": "https://..."}, ...]
  evidence_urls     jsonb       not null default '[]'::jsonb,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A regional source has no country; a country source must have one.
  constraint sources_country_shape check (
    (is_regional and country_code is null) or (not is_regional and country_code is not null)
  ),
  -- RSS sources need a feed URL; other methods must not pretend to have one.
  constraint sources_feed_shape check (
    (fetch_method = 'rss' and feed_url is not null) or (fetch_method <> 'rss')
  )
);

create index sources_country_idx on sources (country_code) where status = 'approved';

-- ---------------------------------------------------------------------------
-- Source vetting log — the after-the-fact audit trail.
-- Append-only: one row per vetting decision, never updated. Re-vetting a source
-- writes a NEW row, so the history of how a verdict changed is preserved.
-- ---------------------------------------------------------------------------
create type vetting_verdict as enum ('approved', 'rejected', 'needs_recheck');

create table source_vetting_log (
  id               uuid primary key default gen_random_uuid(),
  -- Null when the candidate was rejected before ever becoming a source row.
  source_id        uuid references sources(id) on delete set null,
  candidate_name   text        not null,
  candidate_url    text        not null,
  country_code     char(2)     references countries(code),
  verdict          vetting_verdict not null,
  -- Which agent produced this decision: 'gemini-2.5-flash', 'claude-opus-5', 'manual'.
  decided_by       text        not null,
  -- The four criteria from the brief, each scored pass/fail with its own reasoning,
  -- so the owner can see WHICH criterion sank a candidate without reading prose:
  --   { "recent_testimony":   {"pass": bool, "reasoning": "...", "evidence": [url]},
  --     "identifiable_leaders":{...}, "doctrinal_fit": {...}, "corroboration": {...},
  --     "technically_scrapeable": {...} }
  criteria         jsonb       not null default '{}'::jsonb,
  -- Full chain-of-thought narrative for the decision. This is the thing the brief
  -- asks to be reviewable; store it verbatim, never summarised on write.
  reasoning        text        not null,
  -- Raw supporting material the decision leaned on (search results, feed probes).
  evidence         jsonb       not null default '[]'::jsonb,
  model_version    text,
  created_at       timestamptz not null default now()
);

create index vetting_log_created_idx on source_vetting_log (created_at desc);
create index vetting_log_source_idx  on source_vetting_log (source_id);

-- ---------------------------------------------------------------------------
-- Editions — one row per calendar day the engine produces output.
-- ---------------------------------------------------------------------------
create type edition_status as enum ('building', 'published', 'no_send');

create table editions (
  id                    uuid primary key default gen_random_uuid(),
  -- The SGT calendar date this edition belongs to. Unique: one edition per day.
  edition_date          date        not null unique,
  status                edition_status not null default 'building',
  -- The cross-region synthesis (brief step B10). Null on a no_send day.
  consolidation_summary text,
  -- Set when status='no_send' so the owner can tell "nothing qualified" apart
  -- from "the job never ran". Both look like a missing row otherwise.
  no_send_reason        text,
  email_sent_at         timestamptz,
  email_recipient_count integer,
  created_at            timestamptz not null default now()
);

create index editions_date_idx on editions (edition_date desc);

-- ---------------------------------------------------------------------------
-- Per-country summaries within an edition (brief step B9).
-- ---------------------------------------------------------------------------
create table country_summaries (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid        not null references editions(id) on delete cascade,
  country_code  char(2)     not null references countries(code),
  summary       text        not null,
  created_at    timestamptz not null default now(),
  unique (edition_id, country_code)
);

-- ---------------------------------------------------------------------------
-- Testimonies — the per-article summaries. The heart of the archive.
-- ---------------------------------------------------------------------------
create table testimonies (
  id                uuid primary key default gen_random_uuid(),
  edition_id        uuid        not null references editions(id) on delete cascade,
  country_code      char(2)     not null references countries(code),
  source_id         uuid        not null references sources(id),
  title             text        not null,
  -- Canonical URL of the original article. The click-through target; also the
  -- natural key we dedupe on via processed_articles.
  original_url      text        not null,
  article_published_at timestamptz,
  -- The model-generated summary. We never store source article body text —
  -- only this. See the aggregation/fair-use constraint in the brief.
  summary           text        not null,
  -- Rank 1..3 within (edition, country), from the selection heuristic.
  rank              smallint    not null check (rank between 1 and 10),
  selection_score   numeric(6,3),
  -- Populated when this testimony merged two sources covering the same story.
  merged_source_ids uuid[]      not null default '{}',
  was_translated    boolean     not null default false,
  original_language text        not null default 'en',
  model_used        text,
  created_at        timestamptz not null default now(),
  unique (edition_id, country_code, rank)
);

create index testimonies_edition_idx on testimonies (edition_id);
create index testimonies_country_idx on testimonies (country_code, created_at desc);

-- ---------------------------------------------------------------------------
-- processed_articles — the "never summarise the same story twice" ledger.
-- Deliberately separate from `testimonies`: an article can be seen, considered
-- and rejected, and we still must not reconsider it on tomorrow's run.
-- ---------------------------------------------------------------------------
create table processed_articles (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid        not null references sources(id) on delete cascade,
  canonical_url  text        not null,
  -- sha256 of the normalised (lowercased, punctuation-stripped) title. Catches the
  -- case where an outlet changes its URL structure but republishes the same story.
  title_hash     text        not null,
  title          text,
  -- true = we summarised it; false = seen but not selected. Both block reprocessing.
  was_selected   boolean     not null default false,
  date_processed timestamptz not null default now(),
  unique (source_id, canonical_url)
);

create index processed_title_hash_idx on processed_articles (title_hash);
create index processed_date_idx on processed_articles (date_processed desc);

-- ---------------------------------------------------------------------------
-- scrape_failures — one row per source that failed on a given run.
-- The daily job must never die because one outlet changed its markup.
-- ---------------------------------------------------------------------------
create table scrape_failures (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid        references sources(id) on delete set null,
  source_name   text        not null,          -- denormalised: survives source deletion
  failure_date  date        not null default (now() at time zone 'Asia/Singapore')::date,
  stage         text        not null,          -- 'feed_fetch' | 'article_fetch' | 'extract' | 'summarise'
  error_message text        not null,
  url           text,
  created_at    timestamptz not null default now()
);

create index scrape_failures_date_idx on scrape_failures (failure_date desc);

-- ---------------------------------------------------------------------------
-- Feedback — site thumbs/comments. Email replies land in Gmail, not here
-- (see README: inbound parsing needs a custom domain).
-- ---------------------------------------------------------------------------
create type feedback_rating as enum ('up', 'down');

create table feedback (
  id            uuid primary key default gen_random_uuid(),
  -- Feedback can attach to a single testimony or to a whole edition.
  testimony_id  uuid        references testimonies(id) on delete cascade,
  edition_id    uuid        references editions(id) on delete cascade,
  rating        feedback_rating,
  comment       text,
  -- Coarse anti-abuse key: a random id kept in the visitor's localStorage. Not a
  -- user account and not PII; lets us collapse repeat votes without tracking anyone.
  visitor_key   text,
  created_at    timestamptz not null default now(),
  -- A row with neither a rating nor a comment carries no information.
  constraint feedback_has_content check (rating is not null or comment is not null)
);

create index feedback_created_idx on feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- source_suggestions — the reader-facing "suggest a source" form.
-- ---------------------------------------------------------------------------
create table source_suggestions (
  id            uuid primary key default gen_random_uuid(),
  outlet_name   text        not null,
  outlet_url    text        not null,
  country_code  char(2)     references countries(code),
  submitter_email citext,
  note          text,
  reviewed      boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Model: the anon key may READ published archive + approved sources, and may
-- INSERT into the three public write paths (subscribe, feedback, suggest).
-- It may never read subscribers, feedback, failures, or the vetting log.
-- The engine and the admin page use the service-role key and bypass all of this.
-- ---------------------------------------------------------------------------
alter table countries          enable row level security;
alter table subscribers        enable row level security;
alter table sources            enable row level security;
alter table source_vetting_log enable row level security;
alter table editions           enable row level security;
alter table country_summaries  enable row level security;
alter table testimonies        enable row level security;
alter table processed_articles enable row level security;
alter table scrape_failures    enable row level security;
alter table feedback           enable row level security;
alter table source_suggestions enable row level security;

-- Public reads: the archive is deliberately open to anyone, for SEO/discovery.
create policy public_read_countries on countries
  for select to anon, authenticated using (true);

create policy public_read_approved_sources on sources
  for select to anon, authenticated using (status = 'approved');

create policy public_read_published_editions on editions
  for select to anon, authenticated using (status = 'published');

create policy public_read_country_summaries on country_summaries
  for select to anon, authenticated using (
    exists (select 1 from editions e where e.id = edition_id and e.status = 'published')
  );

create policy public_read_testimonies on testimonies
  for select to anon, authenticated using (
    exists (select 1 from editions e where e.id = edition_id and e.status = 'published')
  );

-- Public writes: insert-only, never readable back by the same key.
-- Subscribe goes through a server route, but we allow anon insert so the form
-- keeps working if that route is ever made client-direct.
create policy public_insert_subscriber on subscribers
  for insert to anon, authenticated with check (true);

create policy public_insert_feedback on feedback
  for insert to anon, authenticated with check (true);

create policy public_insert_suggestion on source_suggestions
  for insert to anon, authenticated with check (true);

-- No anon policy at all on: source_vetting_log, processed_articles,
-- scrape_failures. With RLS enabled and no policy, these are unreachable
-- except via the service-role key. That is intentional.
