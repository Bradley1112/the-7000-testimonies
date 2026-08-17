-- The 7000 — vetting round 2: corrections and scope widening (2026-08-17)
--
-- This migration deliberately does NOT edit 0002. Migration 0002 recorded a
-- rejection of Jawaban.com that later proved to rest on a faulty test, and the
-- owner subsequently widened scope to admit mission-agency outlets that 0002
-- had excluded on principle. Both are reversals of logged reasoning.
--
-- The vetting log is an audit trail. An audit trail that gets rewritten when it
-- turns out to be wrong is worthless. So the original entries stay exactly as
-- they were written, and the corrections are appended as new rows that cite them.

-- ===========================================================================
-- 1. Add the source-selection lever the widened scope requires.
--
-- Mission-agency outlets pass every stated credibility criterion but tend to
-- quote agency staff rather than local church leaders. That is a sourcing-shape
-- problem, not an honesty problem, so the fix is a ranking penalty rather than
-- a rejection. See the MNN entry below for the evidence behind this.
-- ===========================================================================
alter table sources
  add column source_perspective text not null default 'local'
    check (source_perspective in ('local', 'regional', 'external'));

comment on column sources.source_perspective is
  'local    = outlet based in and reporting on its own country.
   regional = multi-country outlet with a desk in the region.
   external = outlet based outside SEA reporting on SEA (mission agencies).
   The daily selection heuristic penalises external sources and, within them,
   ranks articles quoting a named local leader above articles quoting only an
   agency spokesperson. Displayed on the Sources tab so readers can weigh it.';

-- Backfill the sources seeded in 0002.
update sources set source_perspective = 'regional'
  where slug = 'christian-daily-international';

-- ===========================================================================
-- 2. CORRECTION — Jawaban.com: rejected in 0002 on a faulty test. Now approved.
-- ===========================================================================
insert into sources (
  name, slug, homepage_url, feed_url, country_code, is_regional, denomination,
  update_cadence, primary_language, needs_translation, fetch_method, status,
  credibility_score, source_perspective, evidence_urls, notes
) values (
  'Jawaban.com', 'jawaban',
  'https://www.jawaban.com/', null,
  'ID', false, 'Non-denominational (CBN Indonesia affiliated)',
  'Updates daily', 'id', true, 'html_index', 'approved',
  75, 'local',
  '[{"label":"ImpactStory testimony archive","url":"https://www.jawaban.com/archive/id/521/ImpactStory.html"},
    {"label":"Inspiring archive","url":"https://www.jawaban.com/archive/id/1/Inspiring.html"},
    {"label":"CBN Indonesia affiliation (registrant contact @cbn.or.id)","url":"https://website.informer.com/jawaban.com"}]'::jsonb,
  'Approved in round 2 after the round-1 rejection was found to be based on a bad test. No RSS feed — scraped via HTML category index pages. Article URLs encode the publication date directly: /read/article/id/YYYY/MM/DD/<category>/<timestamp>/<slug>, so no date parsing from page content is needed. Primary testimony categories are 521 (ImpactStory) and 1 (Inspiring). Indonesian-language throughout, so this is the first source to exercise the translate-to-English path.'
);

insert into source_vetting_log (
  source_id, candidate_name, candidate_url, country_code, verdict, decided_by,
  criteria, reasoning, evidence, model_version
) values (
  (select id from sources where slug = 'jawaban'),
  'Jawaban.com (CORRECTION to round-1 rejection)', 'https://www.jawaban.com/', 'ID', 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Category index probe 2026-08-17: ImpactStory newest article 2026-08-12, Inspiring newest 2026-08-14, News newest 2026-08-17, Devotional newest 2026-08-17. Publishing daily across the site and within days on the testimony categories specifically.", "evidence": ["https://www.jawaban.com/archive/id/521/ImpactStory.html"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Testimony articles centre on named individuals — e.g. Jeremy, Lio, Amel — with their own accounts. First-person subject-centred rather than leader-quoted, comparable in shape to Thir.st.", "evidence": ["https://www.jawaban.com/archive/id/521/ImpactStory.html"]},
    "doctrinal_fit": {"pass": true, "reasoning": "CBN Indonesia affiliated; broadly charismatic-evangelical. Acceptable for a non-denominational Protestant readership. Content surveyed is ordinary testimony and devotional material with no doctrinal outliers.", "evidence": []},
    "corroboration": {"pass": true, "reasoning": "Long-established, widely cited as Indonesia''s principal Christian portal, CBN affiliation via registrant contact.", "evidence": ["https://website.informer.com/jawaban.com"]},
    "technically_scrapeable": {"pass": true, "reasoning": "CORRECTED. Server-rendered, not a SPA. Category index at /archive/id/<cat>/<Name>.html returns 16+ article links to a plain HTTP GET with a browser UA. Publication date is encoded in the article URL path. Requires html_index fetch method rather than RSS.", "evidence": ["https://www.jawaban.com/archive/id/521/ImpactStory.html"]}
  }'::jsonb,
  'This entry corrects the round-1 rejection of Jawaban.com. That rejection was wrong, and the reason it was wrong is worth recording so the same mistake is not repeated on a future source.

What round 1 concluded: that Jawaban is a client-rendered single-page application with no server-side HTML, and therefore unscrapeable without a headless browser. The evidence cited was that /read/category/kesaksian yielded zero article links, and that a deliberately nonsensical path returned a byte-identical response to the supposedly real one.

What was actually true: /read/category/kesaksian is not a real URL on this site. It was my own invention, guessed from the site describing its content as kesaksian. Naturally it returned a catch-all shell — and so did the nonsense path, because both were equally nonexistent. Two nonexistent URLs returning identical shells is not evidence of client-side routing. It is evidence that I guessed the URL pattern wrong and then treated my own guess failing as a property of the site.

The tell that prompted the recheck was the script inventory: the page loads jQuery 3.5.1 slim and Bootstrap, and nothing else. A site doing client-side routing and content assembly needs a framework to do it with. jQuery and Bootstrap are what a server-rendered site from the 2010s loads. The diagnosis and the evidence did not fit each other.

Re-testing from the homepage rather than from a guessed URL: real article links are present in the raw HTML, in the form /read/article/id/2026/07/16/521/260715114732/<slug>. Following the site''s own archive links gives /archive/id/521/ImpactStory.html, which returns 16 article links to a plain curl. Freshness across categories on 2026-08-17: ImpactStory 12 Aug, Inspiring 14 Aug, News 17 Aug, Devotional 17 Aug.

The content is what round 1 correctly judged it to be — genuine testimony, and the best-fitting content found anywhere in the region. Sample headlines from ImpactStory, translated: "Not only the children changed — this Sunday school teacher felt it herself"; "Shunned for his faith, the story of Noah helped Jeremy stop being afraid to talk about God"; "The long wait for a child answered — now a parent, a lesson that changed this couple".

Two useful properties fall out of the URL structure. The publication date is in the path, so the scraper needs no date parsing from page content and no reliance on meta tags. And the category id is in the path too, so testimony categories can be targeted directly rather than filtered after the fact.

General lesson recorded for future vetting rounds: when a scrapeability test fails, verify the URL came from the site''s own markup before concluding anything about the site''s architecture. A guessed URL failing tells you about the guess, not the target.

Verdict: approve, credibility 75, fetch_method html_index, needs_translation true. Indonesia is restored to scope.',
  '[{"type":"correction","supersedes":"round-1 rejection of Jawaban.com on technically_scrapeable"},
    {"type":"category_probe","url":"https://www.jawaban.com/archive/id/521/ImpactStory.html","result":"16 article links, newest 2026-08-12"},
    {"type":"category_probe","url":"https://www.jawaban.com/archive/id/1/Inspiring.html","result":"28 dated articles, newest 2026-08-14"},
    {"type":"root_cause","detail":"round-1 test used a self-invented URL path (/read/category/kesaksian) that does not exist on the site; its failure was misread as client-side rendering"},
    {"type":"disconfirming_signal","detail":"script inventory shows only jQuery 3.5.1 slim + Bootstrap — inconsistent with a client-rendered SPA"}]'::jsonb,
  'claude-opus-5'
);

-- ===========================================================================
-- 3. SCOPE WIDENING — mission-agency / external-perspective outlets.
-- Owner decision, 2026-08-17: admit these to give the nine uncovered countries
-- some chance of appearing. Round 1 had excluded them on principle.
-- ===========================================================================
insert into sources (
  name, slug, homepage_url, feed_url, country_code, is_regional, denomination,
  update_cadence, primary_language, needs_translation, fetch_method, status,
  credibility_score, source_perspective, evidence_urls, notes
) values (
  'Mission Network News', 'mission-network-news',
  'https://www.mnnonline.org/', 'https://www.mnnonline.org/news/feed/',
  null, true, 'Non-denominational (evangelical)',
  'Updates daily', 'en', false, 'rss', 'approved',
  65, 'external',
  '[{"label":"MNN newsroom","url":"https://www.mnnonline.org/news/"},
    {"label":"Example: Cambodia Bible festival report","url":"https://www.mnnonline.org/news/new-generation-of-cambodia-shows-hunger-for-the-gospel/"}]'::jsonb,
  'EXTERNAL perspective — US-based newsroom reporting on Southeast Asia, not a SEA outlet. Admitted under the round-2 scope widening. NOTE the feed trap: the site-wide feed at /feed/ is stale since 2023 and is NOT the news feed; the working one is /news/feed/. Measured SEA density on 2026-08-17: 2 of 10 recent items, both persecution/legal news rather than testimony. Treat as low-yield supplementary.'
);

insert into source_vetting_log (
  source_id, candidate_name, candidate_url, country_code, verdict, decided_by,
  criteria, reasoning, evidence, model_version
) values (
  (select id from sources where slug = 'mission-network-news'),
  'Mission Network News', 'https://www.mnnonline.org/', null, 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Feed at /news/feed/ probed 2026-08-17: 10 items, newest same-week (14 Aug 2026). Genuine daily newsroom cadence. Note that the site-wide /feed/ is stale since Sept 2023 and would have produced a false rejection.", "evidence": ["https://www.mnnonline.org/news/feed/"]},
    "identifiable_leaders": {"pass": false, "reasoning": "PARTIAL FAILURE and the reason this source is marked external. Full-text extraction of the Cambodia report shows the only quoted voice is John Pudaite of Bibles for the World — the organisation that supplied the Bibles, describing its own impact. No Cambodian pastor or local church leader is quoted in a story about Cambodian churches. The brief requires articles to reference or quote identifiable LOCAL pastors and church leaders.", "evidence": ["https://www.mnnonline.org/news/new-generation-of-cambodia-shows-hunger-for-the-gospel/"]},
    "doctrinal_fit": {"pass": true, "reasoning": "Broad evangelical, non-denominational. Nothing that would trouble the target readership.", "evidence": []},
    "corroboration": {"pass": true, "reasoning": "Long-running mission news service with a staffed newsroom. Output is recognisably professional journalism.", "evidence": ["https://www.mnnonline.org/news/"]},
    "technically_scrapeable": {"pass": true, "reasoning": "WordPress RSS at /news/feed/ returns HTTP 200 with well-formed items under a browser UA. Serves 403 to default library user agents.", "evidence": ["https://www.mnnonline.org/news/feed/"]}
  }'::jsonb,
  'Approved under the round-2 scope widening, with a documented partial criterion failure and a specific mitigation. This entry also corrects an overstatement in round 1.

Round 1 dismissed mission-agency outlets collectively as "Western fundraising communications" with "a structural incentive toward the exact triumphalist register the consolidation prompt warns against". Having now read the actual output, that characterisation was too broad and is withdrawn as applied to MNN.

MNN''s Cambodia report is real journalism. It carries specific, checkable detail — 14,000 attendees at Siem Reap in January, 470 participating churches across five provinces, 80,000 Gospels of John and 6,000 Bibles prepared. It attributes its quotes by name. And it volunteers deflating context rather than suppressing it, noting that only about two percent of the Cambodian population is Christian and recounting the Khmer Rouge persecution history. There is no donation appeal in the article body. A newsletter summarising this piece faithfully would not be misleading anyone.

The precise concern that does survive is about sourcing structure, not honesty. In that article the sole quoted voice, John Pudaite, represents Bibles for the World — the organisation whose Bibles the story is about. The striking claim, that 86,000 pieces of literature "ran out in two days", is reported on that single interested party''s word without independent corroboration. And no Cambodian is quoted at all in a story about Cambodian churches. That is precisely the criterion the brief singles out: articles should reference or quote identifiable LOCAL pastors and church leaders.

So the mitigation is a ranking rule rather than a rejection. This source is marked source_perspective = external. The daily selection heuristic applies a penalty to external sources, and within them ranks articles that quote a named local leader above articles that quote only an agency spokesperson. The Sources tab and the archive attribute these items visibly as externally reported, so readers can weigh them.

That the distinction is per-outlet rather than categorical is demonstrated by the comparison case rejected below: Christian Aid Mission passes as an organisation but its RSS feed emits donate-button components, not journalism. Judged individually, MNN is in and Christian Aid Mission is out.

Yield expectation, measured rather than assumed: of the 10 most recent items, 2 mentioned Southeast Asia — the stalled investigation into Pastor Raymond Koh''s disappearance in Malaysia, and the resumed trial of Korean missionary Park Tae-Yeon touching Indonesia and the Philippines. Both are persecution and legal news rather than testimony. This mirrors what was found with Christian Daily International, and it is the honest answer to whether admitting mission-agency sources fills the nine empty countries: it mostly does not. It adds a thin stream of regional news, of which only a fraction is testimony.

Verdict: approve as external/supplementary, credibility 65. Do not let it carry a country.',
  '[{"type":"feed_probe","url":"https://www.mnnonline.org/news/feed/","result":"HTTP 200, 10 items, newest 2026-08-14"},
    {"type":"feed_trap","url":"https://www.mnnonline.org/feed/","result":"HTTP 200 but newest item 2023-09-05 — site-wide feed is stale, /news/feed/ is the live one"},
    {"type":"fulltext_extraction","url":"https://www.mnnonline.org/news/new-generation-of-cambodia-shows-hunger-for-the-gospel/","result":"specific verifiable detail, named attribution, deflating context included, no donation CTA; but sole quoted voice is the supplying agency and no local leader is quoted"},
    {"type":"sea_density","detail":"2 of 10 recent items SEA-relevant; both persecution/legal news, not testimony"},
    {"type":"correction","supersedes":"round-1 blanket characterisation of mission-agency outlets as fundraising communications"}]'::jsonb,
  'claude-opus-5'
);

-- ===========================================================================
-- 4. REJECTION under the widened scope — proving the widening is not blanket.
-- ===========================================================================
insert into source_vetting_log (
  source_id, candidate_name, candidate_url, country_code, verdict, decided_by,
  criteria, reasoning, evidence, model_version
) values (
  null,
  'Christian Aid Mission', 'https://www.christianaid.org/', null, 'rejected', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": false, "reasoning": "DECISIVE FAILURE. The RSS feed does not publish articles. Its four most recent items are titled: Equativ Ad Landing Page Donate Button; Social Media Video Donate Link 05.26; Double Gift Homepage Banner 05.26; Elementor Popup Refugee 04.26. These are CMS marketing components, not stories.", "evidence": ["https://www.christianaid.org/feed/"]},
    "identifiable_leaders": {"pass": false, "reasoning": "n/a — no articles in the feed to assess.", "evidence": []},
    "doctrinal_fit": {"pass": true, "reasoning": "No doctrinal concerns with the organisation itself.", "evidence": []},
    "corroboration": {"pass": true, "reasoning": "Established mission organisation; credibility as an organisation is not in question. This rejection is not about legitimacy.", "evidence": []},
    "technically_scrapeable": {"pass": true, "reasoning": "Feed returns HTTP 200 and parses cleanly. The mechanism works; what comes through it is not journalism.", "evidence": ["https://www.christianaid.org/feed/"]}
  }'::jsonb,
  'Rejected, and included in the log specifically as the counterexample that keeps the round-2 scope widening honest.

The owner''s decision to admit mission-agency sources was not a decision to admit all of them. This candidate demonstrates the difference. Christian Aid Mission is a legitimate organisation and nothing here questions that. But its RSS feed is wired to its marketing CMS rather than to an editorial desk. The four most recent entries are literally named "Equativ Ad Landing Page Donate Button", "Social Media Video Donate Link 05.26", "Double Gift Homepage Banner 05.26" and "Elementor Popup Refugee 04.26" — these are Elementor popups and banner components being syndicated as feed items.

There is nothing here for a summariser to work with. An automated pipeline pointed at this feed would attempt to extract article text from a donate button.

This is also the empirical basis for treating the mission-agency category per outlet rather than as a class. Round 1 was wrong to reject the whole category on the assumption that donor incentives corrupt the copy — MNN disproves that. But round 2 would be wrong to admit the whole category on the assumption that a recognised mission organisation implies a newsroom — Christian Aid Mission disproves that. The only reliable method is the one used throughout both rounds: fetch the feed and read what actually comes out of it.

Verdict: reject on content type. Not worth rechecking unless the organisation launches an actual editorial feed.',
  '[{"type":"feed_probe","url":"https://www.christianaid.org/feed/","result":"HTTP 200, 4 items — all CMS marketing components, zero articles"}]'::jsonb,
  'claude-opus-5'
);

-- ===========================================================================
-- 5. Record the lookback-window change (owner decision, round 2).
-- Documented here rather than only in .env so the reasoning survives.
-- ===========================================================================
comment on table processed_articles is
  'Ledger of every article the engine has already considered, so nothing is
   summarised twice. NOTE its interaction with LOOKBACK_DAYS, widened from 3 to
   30 in round 2: because this table excludes anything already seen, a longer
   window pays off once at cold start and then settles back to the outlet''s
   real publishing rate. Its lasting value is for slow sources — Christianity
   Malaysia publishes roughly monthly and a 3-day window missed it entirely.
   Recency still dominates ranking, so same-day and previous-day articles
   outrank backlog within the window.';
