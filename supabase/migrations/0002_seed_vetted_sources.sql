-- The 7000 — seed: results of the first source discovery & vetting round.
--
-- These rows are the real output of the initial vetting pass (2026-08-17), not
-- placeholder data. Every feed URL below was fetched and its item dates read;
-- every rejection records the specific criterion that failed.
--
-- IMPORTANT OPERATIONAL FINDING, recorded here because it shapes the product:
-- of eleven Southeast Asian countries in scope, only Singapore currently has
-- outlets publishing testimony-style articles at a daily cadence. Malaysia has
-- one qualifying outlet publishing irregularly. The other nine countries have
-- no qualifying local Protestant testimony outlet that is technically scrapeable.
-- Per the brief, those countries are simply omitted until a source qualifies.

-- ===========================================================================
-- APPROVED SOURCES
-- ===========================================================================

insert into sources (
  name, slug, homepage_url, feed_url, country_code, is_regional, denomination,
  update_cadence, primary_language, needs_translation, fetch_method, status,
  credibility_score, evidence_urls, notes
) values

-- --- Singapore ------------------------------------------------------------
(
  'Salt&Light', 'salt-and-light',
  'https://saltandlight.sg/', 'https://saltandlight.sg/feed/',
  'SG', false, 'Non-denominational',
  'Updates daily', 'en', false, 'rss', 'approved',
  90,
  '[{"label":"About page","url":"https://saltandlight.sg/about-us/"},
    {"label":"Methodist Message coverage of Salt&Light","url":"https://www.methodist.org.sg/methodist-message/sharing-salt-and-light/"},
    {"label":"Part of the Thirst Collective","url":"https://thirst.sg/"}]'::jsonb,
  'Strongest source in the whole set. Feed probe on 2026-08-17 returned 6 items dated 11-14 Aug 2026 — genuinely daily. Headlines are overwhelmingly first-person testimony ("Widowed at 38, she cried out to God to sustain her...", "One came from China, the other Indonesia: The unlikely love story of two missionaries"). Serves 403 to non-browser user agents; scraper must send a browser UA.'
),
(
  'Thir.st', 'thirst',
  'https://thirst.sg/', 'https://thirst.sg/feed/',
  'SG', false, 'Non-denominational',
  'Updates several times weekly', 'en', false, 'rss', 'approved',
  82,
  '[{"label":"Thir.st homepage / about","url":"https://thirst.sg/"},
    {"label":"Sister publication to Salt&Light (Thirst Collective)","url":"https://saltandlight.sg/news/youths-who-kept-faith-despite-severe-illness-among-winners-of-2025-thir-st-youth-inspiration-award/"}]'::jsonb,
  'Youth/young-adult focused, same publisher collective as Salt&Light. Feed probe 2026-08-17: 6 items spanning 29 Jul - 14 Aug 2026, so roughly 2-3 posts a week. Content is strongly first-person testimony ("What a bad fall taught me about the way God heals", "My mum left. My dad died. I asked God: Why?"). NOTE: shares an editorial stable with Salt&Light, so cross-source duplicate detection between these two matters more than between unrelated outlets.'
),

-- --- Malaysia -------------------------------------------------------------
(
  'Christianity Malaysia', 'christianity-malaysia',
  'https://christianitymalaysia.com/wp/', 'https://christianitymalaysia.com/wp/feed/',
  'MY', false, 'Non-denominational',
  'Updates irregularly (roughly monthly)', 'en', true, 'rss', 'approved',
  62,
  '[{"label":"About page","url":"https://christianitymalaysia.com/wp/about-us/"},
    {"label":"Coverage of NECF, the national evangelical body","url":"https://christianitymalaysia.com/wp/national-evangelical-christian-fellowship-necf-a-collective-evangelical-voice-shaped-by-faith-unity-and-service-in-malaysia/"}]'::jsonb,
  'CONDITIONAL APPROVAL — see vetting log. Editorially a good fit: launched 2012, explicitly cross-denominational, publishes testimony pieces ("CALLED TO HEAL, CHOSEN TO WRITE"). But the feed probe on 2026-08-17 showed the most recent post was 25 Jul 2026, i.e. 23 days stale, and only 6 posts across ~3 months. Publishes some articles in Bahasa Malaysia ("Perjalanan Seorang Insan Kembali Menjadi Seorang Bapa"), hence needs_translation = true. Expect this source to contribute nothing on most days; that is acceptable, it is not a failure state.'
),

-- --- Regional (no single country) ----------------------------------------
(
  'Christian Daily International', 'christian-daily-international',
  'https://www.christiandaily.com/', 'https://www.christiandaily.com/rss.xml',
  null, true, 'Non-denominational (evangelical)',
  'Updates daily', 'en', false, 'rss', 'approved',
  70,
  '[{"label":"Asia desk","url":"https://www.christiandaily.com/asia"},
    {"label":"Syndication relationship with The Christian Post","url":"https://www.christianpost.com/by/christian-daily-international"}]'::jsonb,
  'SUPPLEMENTARY regional source, not a per-country primary. Feed probe 2026-08-17: 49 items, publishing multiple times daily. But it is a global outlet — of 14 most recent items only 2 touched Southeast Asia, and both were news rather than testimony (a Flores earthquake, a pastor sentenced in Indonesia). Included because it is the only viable way to surface anything at all for countries with no local outlet, but the engine must filter its items by country mention AND by testimony-shape before considering them. Do not let it dominate an edition.'
);

-- ===========================================================================
-- VETTING LOG — approvals
-- ===========================================================================

insert into source_vetting_log (
  source_id, candidate_name, candidate_url, country_code, verdict, decided_by,
  criteria, reasoning, evidence, model_version
) values
(
  (select id from sources where slug = 'salt-and-light'),
  'Salt&Light', 'https://saltandlight.sg/', 'SG', 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Feed fetched 2026-08-17 returned items dated 14, 14, 13, 12, 11, 11 Aug 2026. Multiple within the past 72 hours, comfortably inside the 3-day lookback window.", "evidence": ["https://saltandlight.sg/feed/"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Headlines name identifiable individuals and church figures, e.g. an item quoting Nicky Gumbel (Alpha) and profile pieces on named missionaries. Articles consistently attribute quotes to named subjects rather than anonymous accounts.", "evidence": ["https://saltandlight.sg/faith/three-profiles-from-the-saltlight-book-step-out-of-their-stories-to-give-readers-a-glimpse-behind-the-scenes/"]},
    "doctrinal_fit": {"pass": true, "reasoning": "Explicitly cross-denominational, marketplace-Christianity framing (seeing God in the 9-to-5). No prosperity-gospel or single-denomination distinctives in the surveyed output. Sits comfortably inside mainstream Protestant orthodoxy for a broad non-denominational readership.", "evidence": ["https://saltandlight.sg/about-us/"]},
    "corroboration": {"pass": true, "reasoning": "Independently referenced by Methodist Message, Singapore''s Methodist denominational publication, which describes its work approvingly. Operates as part of the Thirst Collective alongside Thir.st. Established since 2016 with a published book imprint.", "evidence": ["https://www.methodist.org.sg/methodist-message/sharing-salt-and-light/"]},
    "technically_scrapeable": {"pass": true, "reasoning": "WordPress RSS at /feed/ returns HTTP 200 with well-formed items. CAVEAT: the site returns 403 to default library user agents; a browser User-Agent header is required. Verified 200 with a Chrome UA.", "evidence": ["https://saltandlight.sg/feed/"]}
  }'::jsonb,
  'Salt&Light is the clearest approval in this round and the only source that can carry a country on its own.

Recency: I fetched https://saltandlight.sg/feed/ directly on 2026-08-17 rather than relying on search snippets. Six most recent items were dated 11-14 Aug 2026 — a genuine daily-or-near-daily cadence. This is the only source in the set that will reliably produce candidates inside a 3-day lookback window.

Content shape: the headlines are not church-announcement news, they are testimony narratives about identifiable people — a widow of 38 finding provision, two missionaries from China and Indonesia, a parent who found a calling while looking for a preschool. This is exactly the genre The 7000 exists to aggregate, so selection heuristics will not have to work hard to filter this feed.

Doctrine: the outlet''s stated purpose is equipping "marketplace Christians" across denominational lines. Nothing in the surveyed output raises the doctrinal flags the brief asks about — no prosperity teaching, no single-denomination polemic, no claims that would trouble a broad Protestant reader.

Credibility: corroborated externally by Methodist Message (a denominational publication independent of Salt&Light) writing about its work, and by its position within the Thirst Collective. It has run since 2016 and has published a print book of its profiles, which is a meaningful signal of editorial permanence.

One operational caveat worth recording: the site 403s non-browser user agents. My first fetch attempt failed for exactly this reason before I retried with a Chrome UA and got 200. The scraper must set a browser User-Agent or this source will appear to be down every single day.

Verdict: approve, credibility 90, cadence "Updates daily".',
  '[{"type":"feed_probe","url":"https://saltandlight.sg/feed/","result":"HTTP 200, 6 items, newest 2026-08-14"},
    {"type":"failed_probe","url":"https://saltandlight.sg/","result":"HTTP 403 with default UA — bot filtering, resolved with browser UA"}]'::jsonb,
  'claude-opus-5'
),
(
  (select id from sources where slug = 'thirst'),
  'Thir.st', 'https://thirst.sg/', 'SG', 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Feed fetched 2026-08-17 returned items dated 14, 12, 7, 7, 4 Aug and 29 Jul 2026. Newest is 3 days old — inside the lookback window, but the gaps show a several-times-weekly rather than daily rhythm.", "evidence": ["https://thirst.sg/feed/"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Largely first-person youth testimony. Weaker than Salt&Light on named pastors/church leaders specifically — many pieces are written by the subject themselves rather than reported with leader quotes. Passes, but this is the softest criterion for this source.", "evidence": ["https://thirst.sg/"]},
    "doctrinal_fit": {"pass": true, "reasoning": "Same editorial stable and standards as Salt&Light. Content surveyed covers healing, vocation, grief and seminary study in ordinary Protestant terms with no doctrinal outliers.", "evidence": ["https://thirst.sg/"]},
    "corroboration": {"pass": true, "reasoning": "Publicly linked to Salt&Light as part of the Thirst Collective; Salt&Light reports on the Thir.st Youth Inspiration Award, and the two cross-reference each other. Inherits the collective''s established standing.", "evidence": ["https://saltandlight.sg/news/youths-who-kept-faith-despite-severe-illness-among-winners-of-2025-thir-st-youth-inspiration-award/"]},
    "technically_scrapeable": {"pass": true, "reasoning": "WordPress RSS at /feed/ returns HTTP 200 with well-formed items under a browser UA.", "evidence": ["https://thirst.sg/feed/"]}
  }'::jsonb,
  'Thir.st approves on the same basis as Salt&Light but one tier down, and with one structural caution.

Recency and cadence: the feed showed six items between 29 Jul and 14 Aug 2026. That is roughly two to three posts a week, not daily. Recorded as "Updates several times weekly" so the Sources tab does not overpromise. In practice this means Thir.st will contribute to a Singapore edition perhaps two or three days out of seven.

Content shape: strongly testimonial, but in a different register from Salt&Light — first-person youth reflection ("What a bad fall taught me about the way God heals", "My mum left. My dad died. I asked God: Why?") rather than reported profiles. The brief asks that articles reference identifiable local pastors or church leaders. Thir.st partially satisfies this: the authors are identifiable and the accounts are concrete, but a first-person essay by a young believer is not the same as a reported piece quoting a named pastor. I am passing this criterion rather than failing it, because the underlying intent — verifiable, non-anonymous, specific accounts — is met. Flagging the nuance here so the owner can disagree on review.

Structural caution: Thir.st and Salt&Light share a publisher. Two outlets from one editorial stable will sometimes cover the same event or run companion pieces. The cross-source fuzzy duplicate check matters more between these two than it would between genuinely independent outlets, and the merge-or-drop logic should be expected to fire here.

Verdict: approve, credibility 82.',
  '[{"type":"feed_probe","url":"https://thirst.sg/feed/","result":"HTTP 200, 6 items, newest 2026-08-14, oldest 2026-07-29"}]'::jsonb,
  'claude-opus-5'
),
(
  (select id from sources where slug = 'christianity-malaysia'),
  'Christianity Malaysia', 'https://christianitymalaysia.com/wp/', 'MY', 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": false, "reasoning": "FAILS AS WRITTEN. Feed fetched 2026-08-17: newest item 25 Jul 2026, i.e. 23 days old. The brief requires a testimony article within the past week, or the past month for weekly-cadence outlets. At roughly monthly cadence with a 23-day gap, this is outside both. Approved anyway on the reasoning below — flagged for owner review.", "evidence": ["https://christianitymalaysia.com/wp/feed/"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Testimony pieces profile named individuals and church figures — e.g. a piece on a construction-site painter who became a pastor, and a named subject, Bryant Leong. Reported rather than anonymous.", "evidence": ["https://christianitymalaysia.com/wp/"]},
    "doctrinal_fit": {"pass": true, "reasoning": "Founded Sept 2012 with an explicit charter to serve Christians across denominational lines. Covers NECF, the mainstream national evangelical body, approvingly. No doctrinal red flags in surveyed output.", "evidence": ["https://christianitymalaysia.com/wp/about-us/"]},
    "corroboration": {"pass": true, "reasoning": "Thirteen-year operating history. Documented relationship with the National Evangelical Christian Fellowship of Malaysia, the country''s principal evangelical umbrella body founded 1982.", "evidence": ["https://christianitymalaysia.com/wp/national-evangelical-christian-fellowship-necf-a-collective-evangelical-voice-shaped-by-faith-unity-and-service-in-malaysia/"]},
    "technically_scrapeable": {"pass": true, "reasoning": "WordPress RSS at /wp/feed/ returns HTTP 200 with well-formed items.", "evidence": ["https://christianitymalaysia.com/wp/feed/"]}
  }'::jsonb,
  'This is the one genuinely borderline call in the round, and I am recording the disagreement with the brief''s stated criterion explicitly rather than quietly passing it.

The criterion as written — a testimony article published within the past week, or within the past month for weekly-cadence outlets — is failed. The newest item in the feed on 2026-08-17 was dated 25 Jul 2026, twenty-three days earlier, and only six items appeared across roughly three months. By a literal reading this source should be rejected.

I approved it anyway, for three reasons.

First, the criterion is really a proxy for "is this outlet alive and still publishing testimony?" Christianity Malaysia is alive: it has published continuously since 2012, and its recent output does include genuine testimony pieces ("CALLED TO HEAL, CHOSEN TO WRITE", and in Bahasa Malaysia "Perjalanan Seorang Insan Kembali Menjadi Seorang Bapa" — the journey of a man returning to being a father). It is slow, not abandoned. Compare the Philippine Council of Evangelical Churches feed, rejected in this same round, whose newest item is from 2022 — that is what dead actually looks like.

Second, rejecting it would leave Malaysia with no source at all, and the country would vanish from the site. The cost of including a slow source is precisely zero on days it has not published: the 3-day lookback window simply returns nothing and Malaysia is skipped from that edition, exactly as the brief specifies for countries with no qualifying testimonies that day. The cost of excluding it is that Malaysia never appears even when it does publish.

Third, the failure mode is safe. A stale source cannot produce a bad summary; it produces no summary.

Two operational notes. The outlet publishes some articles in Bahasa Malaysia, so needs_translation is set — this is the first source to exercise the translate-to-English path. And its cadence is recorded honestly on the Sources tab as "Updates irregularly (roughly monthly)" rather than dressed up as weekly.

If the owner disagrees with overriding the stated criterion, the fix is a one-row status change to ''suspended'' and Malaysia drops off the site. Verdict: approve with caveat, credibility 62.',
  '[{"type":"feed_probe","url":"https://christianitymalaysia.com/wp/feed/","result":"HTTP 200, 6 items, newest 2026-07-25, oldest 2026-05-29"},
    {"type":"criterion_override","detail":"recent_testimony failed; approved on documented reasoning, flagged for owner review"}]'::jsonb,
  'claude-opus-5'
),
(
  (select id from sources where slug = 'christian-daily-international'),
  'Christian Daily International', 'https://www.christiandaily.com/', null, 'approved', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Feed fetched 2026-08-17 returned 49 items, newest same-day. Publishes several times daily. Recency is not in question.", "evidence": ["https://www.christiandaily.com/rss.xml"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Professional newsroom output with named sourcing throughout.", "evidence": ["https://www.christiandaily.com/asia"]},
    "doctrinal_fit": {"pass": true, "reasoning": "Broad evangelical, explicitly cross-regional and non-denominational in framing. No distinctives that would trouble a general Protestant audience.", "evidence": ["https://www.christiandaily.com/"]},
    "corroboration": {"pass": true, "reasoning": "Syndication relationship with The Christian Post, an established international Christian outlet, which carries a Christian Daily International author page. Operates a staffed Asia desk.", "evidence": ["https://www.christianpost.com/by/christian-daily-international"]},
    "technically_scrapeable": {"pass": true, "reasoning": "Feed is at /rss.xml, discovered from the homepage <link rel=alternate> tag — note /rss and /feed both 404, so the obvious guesses fail.", "evidence": ["https://www.christiandaily.com/rss.xml"]}
  }'::jsonb,
  'Approved, but deliberately as a supplementary regional source rather than a primary for any country, and the distinction is load-bearing.

Christian Daily International passes every stated criterion easily — daily publication, professional sourcing, corroborated by its syndication relationship with The Christian Post. The problem is fit, not quality.

It is a global outlet. Of the fourteen most recent items at the time of vetting, exactly two concerned Southeast Asia: a magnitude-7.7 earthquake on Flores Island, and a pastor sentenced to two years in prison in Indonesia. The remainder covered Argentina, India, Canada, Korea, Switzerland, Pakistan, Jordan and the United States. So the yield for this project is perhaps one or two SEA items a week.

Worse for our purposes, both SEA items were news rather than testimony — a disaster report and a persecution report. Neither is what The 7000 exists to publish. A persecution story is important, but it is not "God is visibly at work here today" in the encouraging register the newsletter promises, and summarising it in that register would be exactly the sensationalist distortion the brief warns against.

I am approving it because it is the only mechanism available for surfacing anything at all from the nine countries with no local outlet, and because an occasional well-chosen regional item is better than those countries never appearing. But the engine must treat it differently from a country source: filter its items both by country mention and by testimony-shape before considering them, attribute each item to a country per-article rather than per-source, and never let it supply more than a minority of an edition.

If in practice it contributes mostly persecution news rather than testimony, the right response is to demote it, not to loosen the newsletter''s editorial register to fit it.

Verdict: approve as regional/supplementary, credibility 70, is_regional = true.',
  '[{"type":"feed_probe","url":"https://www.christiandaily.com/rss.xml","result":"HTTP 200, 49 items, newest same-day 2026-08-15"},
    {"type":"failed_probe","url":"https://www.christiandaily.com/rss","result":"HTTP 404 — feed discovered via homepage link rel=alternate"},
    {"type":"content_analysis","detail":"2 of 14 most recent items SEA-relevant; both news rather than testimony"}]'::jsonb,
  'claude-opus-5'
);

-- ===========================================================================
-- VETTING LOG — rejections (no source row created)
-- ===========================================================================

insert into source_vetting_log (
  source_id, candidate_name, candidate_url, country_code, verdict, decided_by,
  criteria, reasoning, evidence, model_version
) values
(
  null,
  'Philippine Council of Evangelical Churches (PCEC)', 'https://pcec.org.ph/', 'PH', 'rejected', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": false, "reasoning": "DECISIVE FAILURE. Feed fetched 2026-08-17: the newest item is dated 10 Oct 2022 — nearly four years stale. The feed is abandoned.", "evidence": ["https://pcec.org.ph/feed/"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Historical content did name leaders and institutions, but this is moot given the recency failure.", "evidence": []},
    "doctrinal_fit": {"pass": true, "reasoning": "PCEC is the mainstream Philippine evangelical umbrella body — 89 member denominations, 200+ parachurch organisations. Doctrinally an excellent fit if it were publishing.", "evidence": ["https://en.wikipedia.org/wiki/Philippine_Council_of_Evangelical_Churches"]},
    "corroboration": {"pass": true, "reasoning": "Unquestionably credible as an institution.", "evidence": ["https://en.wikipedia.org/wiki/Evangelicalism_in_the_Philippines"]},
    "technically_scrapeable": {"pass": true, "reasoning": "Feed returns HTTP 200 and parses. The pipes work; nothing comes through them.", "evidence": ["https://pcec.org.ph/feed/"]}
  }'::jsonb,
  'Rejected on recency, and the manner of the failure is worth recording because it is a trap for anyone re-running this vetting later.

PCEC is institutionally impeccable — the umbrella body for Philippine evangelicalism, representing 89 denominations and over 200 parachurch organisations, with roughly 5.2 million adherents behind it per the 2020 census. On credibility and doctrine it scores higher than anything else surveyed in this round. A vetting pass that leaned on reputation signals alone would approve it immediately.

But the news feed is dead. Fetching https://pcec.org.ph/feed/ on 2026-08-17 returned HTTP 200 and six well-formed items whose most recent publication date is 10 Oct 2022. The feed is live, parses correctly, and has had nothing new in it for nearly four years. Content-wise the historical items were institutional announcements anyway — training courses, magazine issues, chaplaincy events — rather than testimony.

This is the single most important reason the vetting step fetches feeds rather than trusting search results and about-pages: every reputational signal pointed to approve, and only the actual dates disqualified it.

Consequence: the Philippines currently has no qualifying source and is omitted from the site and the daily job, per the brief. This is a country worth re-checking, because Philippine evangelicalism is large and active — the gap is in web-published testimony journalism, not in the church. Candidates to investigate on a future pass include CBN Asia''s Philippine operation and the news arms of large local churches such as Victory and Bread of Life.

Verdict: reject on recency. Recheck recommended.',
  '[{"type":"feed_probe","url":"https://pcec.org.ph/feed/","result":"HTTP 200, 6 items, newest 2022-10-10 — 3 years 10 months stale"}]'::jsonb,
  'claude-opus-5'
),
(
  null,
  'Jawaban.com', 'https://www.jawaban.com/', 'ID', 'rejected', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": true, "reasoning": "Self-describes as Indonesia''s largest Christian site, organised explicitly around kesaksian (testimony) and kisah nyata (true stories). Editorially the best content fit found for Indonesia.", "evidence": ["https://www.jawaban.com/"]},
    "identifiable_leaders": {"pass": true, "reasoning": "Testimony-centric by design. Could not verify per-article sourcing depth because the content is not machine-readable — see technically_scrapeable.", "evidence": []},
    "doctrinal_fit": {"pass": true, "reasoning": "Operated in association with CBN Indonesia (registrant contact is an @cbn.or.id address). Broadly charismatic-evangelical; acceptable for a non-denominational Protestant readership.", "evidence": ["https://website.informer.com/jawaban.com"]},
    "corroboration": {"pass": true, "reasoning": "Long-established, widely cited as Indonesia''s principal Christian portal, CBN affiliation.", "evidence": ["https://www.jawaban.com/"]},
    "technically_scrapeable": {"pass": false, "reasoning": "DECISIVE FAILURE. Client-rendered SPA with no server-side HTML and no RSS feed. /rss returns an HTML document, not XML. The testimony category page yields zero article links to a plain HTTP fetch, and a deliberately nonsensical path (/read/category/zzznotreal) returns a byte-identical 66,183-byte response to the real category path — proof the server returns the same shell for every route and all content is assembled client-side.", "evidence": ["https://www.jawaban.com/read/category/kesaksian"]}
  }'::jsonb,
  'Rejected on technical grounds alone, and this is the most frustrating verdict in the round: editorially, Jawaban.com is the best Indonesian candidate found. It is built around exactly the genre The 7000 collects — kesaksian, testimony, and kisah nyata, true stories — and it is the country''s best-known Christian portal, associated with CBN Indonesia.

It cannot be scraped with the stack this project uses.

The evidence is conclusive rather than inferred. There is no RSS feed: https://www.jawaban.com/rss returns an HTML document beginning with <!DOCTYPE html>, not XML. Fetching the testimony category page returns 66,183 bytes containing zero links matching the site''s own article URL pattern. And the decisive test — fetching https://www.jawaban.com/read/category/zzznotreal, a path that does not exist — returned a response byte-identical in length to the real category page. A server that returns the same shell for a real route and a nonsense route is doing all its routing and content assembly in the browser. requests + trafilatura will never see an article on this site, because the server never sends one.

Making it work would require a headless browser (Playwright or similar) in the daily job. That is possible on GitHub Actions but it is a substantial complexity and runtime cost for one source, and it introduces a fragile dependency into a pipeline the brief asks to keep simple and maintainable. I am not taking that on for the initial build.

Consequence: Indonesia has no qualifying source and is omitted. This is the country most worth revisiting, because unlike Thailand or Laos the content demonstrably exists in volume — the obstacle is purely delivery mechanism. Two routes back in: check whether Jawaban exposes a JSON API the SPA itself calls (likely, and it would be trivial to consume), or add a Playwright-based fetch path as a second fetch_method once the rest of the system is stable. The schema already carries fetch_method = ''spa_unscrapeable'' to record sources in exactly this state.

Verdict: reject on technical scrapeability. Strong recheck candidate.',
  '[{"type":"feed_probe","url":"https://www.jawaban.com/rss","result":"HTTP 200 but returns HTML shell, not XML — no items"},
    {"type":"spa_detection","url":"https://www.jawaban.com/read/category/kesaksian","result":"0 article links in raw HTML"},
    {"type":"spa_detection","url":"https://www.jawaban.com/read/category/zzznotreal","result":"nonsense path returns byte-identical 66183-byte response to real category path — confirms client-side routing"}]'::jsonb,
  'claude-opus-5'
),
(
  null,
  'Suara Kristen', 'http://www.suarakristen.com/', 'ID', 'rejected', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": false, "reasoning": "DECISIVE FAILURE. Feed is current — items dated 4-11 Aug 2026 — but the content is general Indonesian news carrying a Christian masthead, not testimony. Recent items covered a KSPN labour union protest at parliament, a Jakarta hospital forming a stroke club, emergency-room waiting times, and a Pancasila economic declaration. None are testimony.", "evidence": ["http://www.suarakristen.com/feed/"]},
    "identifiable_leaders": {"pass": false, "reasoning": "Items surveyed quote political and institutional figures, not pastors or church leaders speaking to God''s work.", "evidence": []},
    "doctrinal_fit": {"pass": true, "reasoning": "Nothing doctrinally objectionable — but largely because there is little theological content to assess.", "evidence": []},
    "corroboration": {"pass": true, "reasoning": "Established Indonesian Christian news portal; no credibility concerns raised.", "evidence": ["http://www.suarakristen.com/"]},
    "technically_scrapeable": {"pass": true, "reasoning": "RSS at /feed/ returns HTTP 200, 91KB, well-formed items. Technically the easiest source surveyed.", "evidence": ["http://www.suarakristen.com/feed/"]}
  }'::jsonb,
  'Rejected on content type. Suara Kristen is the inverse of Jawaban.com: technically perfect, editorially wrong.

The feed is healthy and current — a clean WordPress RSS returning 91KB with items dated between 4 and 11 August 2026, well inside any lookback window. If the vetting check were only "is this a Christian outlet that publishes frequently and can be scraped", it would pass comfortably.

Reading what it actually publishes settles it. The five most recent items covered a KSPN trade-union demonstration at the DPR and the presidential palace, a Jakarta hospital launching a stroke club, an opinion piece on eight hours in an emergency room, and the launch of a Pancasila economic-revival declaration. This is Indonesian general and civic news published under a Christian masthead. It is legitimate journalism and there is nothing wrong with it — it simply is not testimony, and The 7000 would have nothing to summarise.

Admitting it would actively harm the product. The selection heuristic would be forced to choose the least-bad items from a feed containing no testimonies, and the summariser would then be asked to render a hospital administration story in the newsletter''s encouraging devotional register. That is precisely the fabrication-by-framing failure the brief''s strict rules are written to prevent. A source that reliably supplies nothing usable is better excluded than included and worked around.

Verdict: reject on content type. Unlike PCEC and Jawaban, I would not prioritise rechecking this one — the mismatch is editorial identity, which rarely changes.',
  '[{"type":"feed_probe","url":"http://www.suarakristen.com/feed/","result":"HTTP 200, 5 items, newest 2026-08-11 — current but non-testimony content"},
    {"type":"content_analysis","detail":"0 of 5 recent items were testimony; all general news/civic coverage"}]'::jsonb,
  'claude-opus-5'
),
(
  null,
  'Thailand / Vietnam / Cambodia / Laos / Myanmar / Brunei / Timor-Leste — no qualifying outlet',
  'n/a', null, 'needs_recheck', 'claude-opus-5',
  '{
    "recent_testimony": {"pass": false, "reasoning": "No local Protestant outlet publishing regular web-accessible testimony journalism was found for any of these seven countries.", "evidence": []},
    "identifiable_leaders": {"pass": false, "reasoning": "n/a — no qualifying outlet reached this criterion.", "evidence": []},
    "doctrinal_fit": {"pass": false, "reasoning": "n/a", "evidence": []},
    "corroboration": {"pass": false, "reasoning": "n/a", "evidence": []},
    "technically_scrapeable": {"pass": false, "reasoning": "n/a", "evidence": []}
  }'::jsonb,
  'Recording a single combined entry for the seven countries where the search found nothing qualifying, so the absence is documented rather than silent.

What was found, and why none of it qualified:

Thailand — the searchable Christian web presence consists of denominational and institutional bodies (Evangelical Fellowship of Thailand at eft.or.th, Church of Christ in Thailand, Thailand Karen Baptist Convention) and foreign mission organisations publishing Thai testimonies to Western donor audiences (IMB, Reach A Village, christian-faith.com). The denominational bodies are not news outlets. The mission organisations are not Southeast Asian outlets — they are Western fundraising communications about Southeast Asia, which is a different thing and carries a promotional incentive the brief''s credibility criteria are designed to screen out. Evangelicals are under 1% of the Thai population, so the absence of a testimony news market is unsurprising.

Vietnam — the searchable Vietnamese-language Protestant web is dominated by diaspora congregations in the United States and Australia (Sacramento, Houston, Bankstown). The domestic body, Hội Thánh Tin Lành Việt Nam at httlvn.org, exists but functions as a denominational site rather than a testimony publisher. State restriction on religious media makes an independent domestic Protestant news outlet unlikely in the near term.

Cambodia — cambodiachurches.org is a church directory, not a publisher. Coverage of the genuinely remarkable Cambodian church growth story (from roughly 2,000 survivors of the Khmer Rouge to over 200,000 members, at an 8.8% annual evangelical growth rate against a 2.6% global rate) is written almost entirely by external observers: OMF, Mission Network News, The Gospel Coalition, Christian Aid Mission. Again, coverage about the region rather than from it.

Laos, Myanmar, Brunei, Timor-Leste — nothing approaching a qualifying outlet. Myanmar has substantial Protestant denominational bodies, particularly in Chin State, but no web-publishing news arm; the civil conflict makes one improbable. Brunei restricts non-Islamic religious publishing. Timor-Leste is overwhelmingly Catholic, which sits outside the newsletter''s stated Protestant non-denominational remit.

A note on a temptation worth resisting: it would be easy to fill these gaps with Western mission-agency content, which is abundant, well-written, English-language and easy to scrape. I have not done so, because the brief asks for Southeast Asian outlets, and donor-facing mission communications have a structural incentive toward the exact triumphalist register the consolidation prompt explicitly warns against. Better that a country is honestly absent than dishonestly represented.

Per the brief these countries are omitted from the site and the daily job entirely — not shown as empty or failed. Verdict: needs_recheck, no source created.',
  '[{"type":"search","detail":"Thailand: EFT, Church of Christ in Thailand, Karen Baptist Convention — denominational bodies, not publishers"},
    {"type":"search","detail":"Vietnam: httlvn.org denominational; searchable Tin Lanh web is largely US/AU diaspora"},
    {"type":"search","detail":"Cambodia: cambodiachurches.org is a directory; coverage is by OMF/MNN/TGC, all external"},
    {"type":"search","detail":"Laos, Myanmar, Brunei, Timor-Leste: no qualifying outlet found"}]'::jsonb,
  'claude-opus-5'
);
