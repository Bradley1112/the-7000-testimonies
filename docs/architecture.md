# The 7000 — architecture

Four diagrams: how the pieces fit, what the daily run actually does, what the database looks like, and how a reader moves through the product.

---

## 1. System architecture

Two independent runtimes sharing one database. The site never talks to the engine, and the engine never talks to the site — Postgres is the entire contract between them, which is why the site keeps serving the archive perfectly well on a morning when the job fails.

```mermaid
flowchart TB
    subgraph reader["Reader"]
        browser["Browser"]
        inbox["Email inbox"]
    end

    subgraph vercel["Vercel — Next.js (free tier)"]
        pages["Pages<br/>home · sources · archive · suggest"]
        api["Route handlers<br/>subscribe · confirm · unsubscribe<br/>feedback · suggest-source"]
        admin["/admin<br/>magic link + allowlist"]
    end

    subgraph gha["GitHub Actions — 22:45 UTC daily"]
        engine["run_daily.py"]
    end

    subgraph data["Supabase Postgres (free tier)"]
        db[("subscribers · sources<br/>source_vetting_log · editions<br/>testimonies · country_summaries<br/>processed_articles · scrape_failures<br/>feedback · source_suggestions")]
    end

    subgraph external["External"]
        sources["Vetted outlets<br/>Salt&amp;Light · Thir.st<br/>Jawaban · Christianity Malaysia<br/>+ regional"]
        gemini["Gemini 2.5 Flash<br/>(Claude Haiku 4.5 fallback)"]
        brevo["Brevo<br/>(Resend adapter ready)"]
    end

    browser --> pages
    browser --> api
    browser --> admin
    pages -- "anon key, RLS enforced" --> db
    api -- "service role" --> db
    admin -- "service role" --> db
    api -- "confirmation email" --> brevo

    engine -- "service role" --> db
    engine -- "fetch + extract" --> sources
    engine -- "summarise" --> gemini
    engine -- "daily digest" --> brevo
    brevo --> inbox
    inbox -- "banner links back" --> pages

    classDef ext fill:#f4f6ec,stroke:#454b1b,color:#1c1d17
    classDef store fill:#e4e7d5,stroke:#454b1b,color:#1c1d17
    class sources,gemini,brevo ext
    class db store
```

**Why the engine is Python and the site is TypeScript.** `trafilatura` is the best article-text extractor available and has no real JavaScript equivalent; `thefuzz` likewise for the duplicate matching. Rather than reimplement both badly, the scheduled job is Python and the web app is TypeScript. The cost is two languages in one repo. The benefit is that neither side is compromised, and GitHub Actions runs Python for free.

**Why not a Vercel Cron.** Vercel's free-tier cron is limited and the job would run inside a serverless function with an execution ceiling. A GitHub Action gets 2,000 free minutes a month, a full Python environment, and artifact upload so you can read the rendered edition after the fact.

---

## 2. The daily run, step by step

```mermaid
sequenceDiagram
    autonumber
    participant GHA as GitHub Actions
    participant Job as run_daily.py
    participant DB as Postgres
    participant Src as Vetted outlets
    participant LLM as Gemini 2.5 Flash
    participant Mail as Brevo

    GHA->>Job: trigger 22:45 UTC (07:00 SGT)
    Job->>DB: create or reuse today's edition row
    Job->>DB: read approved sources

    loop each source
        Job->>Src: fetch feed / category index (browser UA, 1 retry)
        alt fetch fails twice
            Job->>DB: insert scrape_failures, skip this source
        else ok
            Src-->>Job: candidate headlines + dates
        end
    end

    Job->>Job: drop anything older than the lookback window
    Job->>DB: check processed_articles (url + title hash)
    DB-->>Job: already-seen articles excluded

    loop each remaining candidate
        Job->>Src: fetch article HTML
        Job->>Job: trafilatura extract — title + body only
        Job->>DB: mark processed (seen, not selected)
    end

    Job->>Job: fuzzy-match titles across sources (thefuzz)
    Note over Job: duplicates collapse to the stronger candidate,<br/>both outlets credited on the survivor

    Job->>Job: score and take the top 3 per country

    loop each selected testimony
        Job->>LLM: summarise (cached system prompt)
        alt model returns NOT_A_TESTIMONY
            LLM-->>Job: veto
            Note over Job: dropped — the backstop for<br/>what the keyword filter got wrong
        else
            LLM-->>Job: 5–7 sentence summary
            Job->>DB: insert testimony, mark selected
        end
    end

    loop each country with at least one testimony
        Job->>LLM: 1–2 sentence country summary
        Job->>DB: insert country_summary
    end

    alt no country qualified
        Job->>DB: mark edition no_send + reason
        Note over Job,Mail: no email — recorded, not a silent gap
    else at least one country
        Job->>LLM: consolidation summary
        Job->>DB: read confirmed subscribers
        loop each subscriber
            Job->>Mail: send with per-subscriber unsubscribe link
        end
        Job->>DB: publish edition + recipient count
    end
```

**Three things worth noticing.**

*Articles are marked processed before they are selected, not after.* An article we fetched, considered and passed over must not come back tomorrow. Otherwise a mediocre piece inside a 30-day window would be reconsidered every single day.

*The model's veto sits after selection, not before.* It costs one call on an article that gets dropped. That is the right trade: the keyword pre-filter is cheap and crude, the model is accurate and cheap enough, and shipping a persecution story rewritten in a devotional register is the one failure this product genuinely cannot afford.

*Every failure path continues.* A dead source, a failed extraction, a model error, a bad email address — each is logged and stepped over. The only thing that stops an edition is having nothing at all to send.

---

## 3. Database

```mermaid
erDiagram
    countries ||--o{ sources : "publishes from"
    countries ||--o{ testimonies : "filed under"
    countries ||--o{ country_summaries : "filed under"
    countries ||--o{ source_vetting_log : "assessed for"
    countries ||--o{ source_suggestions : "nominated for"

    sources ||--o{ testimonies : "reported"
    sources ||--o{ processed_articles : "seen from"
    sources ||--o{ scrape_failures : "failed on"
    sources ||--o{ source_vetting_log : "decided about"

    editions ||--o{ testimonies : contains
    editions ||--o{ country_summaries : contains
    editions ||--o{ feedback : "rated"

    testimonies ||--o{ feedback : "rated"

    countries {
        char2 code PK
        text name
        boolean in_scope
    }
    subscribers {
        uuid id PK
        citext email UK
        enum status "pending|confirmed|unsubscribed|bounced"
        uuid confirm_token "single use"
        uuid unsubscribe_token "stable secret"
        timestamptz subscribed_at
    }
    sources {
        uuid id PK
        text name
        text slug UK
        text feed_url "null unless rss"
        char2 country_code FK "null = regional"
        enum fetch_method "rss|html_index|spa_unscrapeable"
        enum status "approved|rejected|suspended"
        text source_perspective "local|regional|external"
        smallint credibility_score
        boolean needs_translation
        jsonb evidence_urls
    }
    source_vetting_log {
        uuid id PK
        uuid source_id FK "null if never created"
        enum verdict
        text decided_by
        jsonb criteria "5 criteria, each pass+reasoning"
        text reasoning "full chain of thought"
        jsonb evidence
        timestamptz created_at
    }
    editions {
        uuid id PK
        date edition_date UK "SGT calendar day"
        enum status "building|published|no_send"
        text consolidation_summary
        text no_send_reason
        integer email_recipient_count
    }
    testimonies {
        uuid id PK
        uuid edition_id FK
        char2 country_code FK
        uuid source_id FK
        text title
        text original_url
        text summary "model-generated only"
        smallint rank "1..3 per country"
        uuid_array merged_source_ids
        boolean was_translated
    }
    country_summaries {
        uuid id PK
        uuid edition_id FK
        char2 country_code FK
        text summary
    }
    processed_articles {
        uuid id PK
        uuid source_id FK
        text canonical_url UK
        text title_hash "sha256 of normalised title"
        boolean was_selected
    }
    scrape_failures {
        uuid id PK
        uuid source_id FK
        text source_name "denormalised"
        text stage
        text error_message
        date failure_date
    }
    feedback {
        uuid id PK
        uuid testimony_id FK
        uuid edition_id FK
        enum rating "up|down"
        text comment
        text visitor_key "localStorage id, not PII"
    }
    source_suggestions {
        uuid id PK
        text outlet_name
        text outlet_url
        char2 country_code FK
        boolean reviewed
    }
```

**Design decisions.**

*`processed_articles` is separate from `testimonies` on purpose.* An article can be fetched, considered and rejected — and must still never be reconsidered. Deriving "have we seen this?" from `testimonies` would only remember the ones we published.

*`source_vetting_log` is append-only.* Re-vetting inserts; it never updates. Migration `0003` corrects two round-1 decisions by adding rows that cite the originals, because an audit trail you rewrite when it turns out to be wrong is not an audit trail.

*`scrape_failures.source_name` is denormalised.* If a source row is ever deleted, the failure history stays readable.

*Only summaries are stored, never source article text.* Extracted body text lives in memory for the duration of one model call and is never persisted. That is what keeps this aggregation rather than republication.

*Row-level security is on for every table.* The anon key may read published editions and approved sources, and insert into the three public write paths. It cannot read subscribers, feedback, scrape failures or the vetting log — those have RLS enabled and no policy at all, which makes them unreachable except via the service-role key.

---

## 4. Reader journey

```mermaid
flowchart TD
    start(["Arrives at the site"]) --> story{"First visit?"}
    story -- yes --> teaser["Scene 4 cold open<br/>'Yet I have reserved 7,000…'"]
    teaser --> full["Scenes 1 → 2 → 3 → 4<br/>fire · desert · cave · whisper"]
    full --> flag[/"localStorage flag set<br/>at the resolution"/]
    story -- no --> quiet["Quiet 'replay the story' link"]

    flag --> capture
    quiet --> capture
    start --> capture["Email field — address only"]

    capture --> optin["Double opt-in<br/>confirmation email"]
    optin --> confirmed{"Link tapped?"}
    confirmed -- no --> lapsed(["Stays pending<br/>never emailed again"])
    confirmed -- yes --> subscribed(["Confirmed"])

    subscribed --> digest["07:00 SGT daily digest"]
    digest --> clicks["Reads a summary →<br/>clicks through to the outlet"]
    digest --> replies["Replies to the email"]
    digest --> unsub["One-click unsubscribe"]

    browse(["Anyone — no subscription"]) --> archive["Archive, publicly readable"]
    archive --> thumbs["👍 / 👎 + comment"]

    replies -.->|"Gmail, not ingested<br/>needs a domain"| owner
    thumbs --> feedbackdb[("feedback table")]
    feedbackdb --> owner["Owner reviews at /admin"]
    suggest["Suggest a source"] --> owner
    archive --> suggest

    owner --> vet["vet_sources.py<br/>→ source_vetting_log"]
    vet --> sourceslist["Sources page"]
    sourceslist --> digest

    classDef gap fill:#fff4e0,stroke:#b8860b,color:#1c1d17
    class replies gap
```

The dotted line is the honest one: **email replies reach a human inbox but are not ingested into the feedback table.** Inbound parsing needs a custom domain. Everything else in this loop is wired.

Note also that the archive is deliberately open to anyone. It is the SEO surface and the thing a reader can forward to someone who needs it, and gating it behind a subscription would work against the entire point of the project.
