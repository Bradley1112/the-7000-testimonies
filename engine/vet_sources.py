#!/usr/bin/env python3
"""
Source discovery and vetting.

    python engine/vet_sources.py --url https://example.com/ --name "Example" --country TH
    python engine/vet_sources.py --recheck            # re-vet every approved source
    python engine/vet_sources.py --url ... --apply    # also insert/update the sources row

Run once at the start, then only when expanding scope or when a reader
nominates something. This is NOT part of the daily job.

The decision is AI-driven with no human-approval gate, exactly as the brief
specifies — but every decision writes its full chain of thought to
source_vetting_log for review after the fact.

What this script does that a purely model-based judgement cannot: it fetches
the feed and reads the actual publication dates first, then hands the model
real evidence. The first vetting round proved why that matters. The Philippine
Council of Evangelical Churches has impeccable institutional credibility and
every reputational signal said approve — only the dates disqualified it, its
newest item being from 2022. A model reasoning from reputation alone would have
approved it.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import feedparser  # noqa: E402
import requests  # noqa: E402
import trafilatura  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

import db  # noqa: E402
import llm  # noqa: E402
from config import config  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
log = logging.getLogger("vet")


VETTING_SYSTEM_PROMPT = """\
You are vetting a candidate news outlet for "The 7000," a daily newsletter that
collects testimonies of God's work across Southeast Asia for a Protestant,
non-denominational Christian readership.

You will be given hard evidence gathered by fetching the outlet: its recent
headlines with publication dates, a sample of extracted article text, and
whether it is technically scrapeable.

Assess it against five criteria and return STRICT JSON, no prose outside it:

{
  "verdict": "approved" | "rejected" | "needs_recheck",
  "credibility_score": 0-100,
  "update_cadence": "human-readable, e.g. 'Updates daily'",
  "denomination": "best guess, or 'Non-denominational'",
  "primary_language": "ISO 639-1 code",
  "criteria": {
    "recent_testimony":      {"pass": bool, "reasoning": "..."},
    "identifiable_leaders":  {"pass": bool, "reasoning": "..."},
    "doctrinal_fit":         {"pass": bool, "reasoning": "..."},
    "corroboration":         {"pass": bool, "reasoning": "..."},
    "technically_scrapeable":{"pass": bool, "reasoning": "..."}
  },
  "reasoning": "Your full chain of thought, several paragraphs. Explain what you
                weighed, what nearly changed your mind, and any criterion you
                are overriding and why."
}

JUDGEMENT NOTES, learned from the first vetting round:
- Recency is decided by the DATES PROVIDED, never by reputation. An outlet whose
  newest item is years old is rejected however distinguished it is.
- A Christian masthead is not enough. An outlet publishing general or civic news
  under a Christian banner has nothing for this newsletter to summarise, and
  admitting it would push the summariser to force news into a devotional
  register. Reject on content type.
- Distinguish a newsroom from a fundraising CMS. Some mission organisations do
  real reporting; others syndicate donate buttons as feed items. Judge the
  actual output, never the category.
- If an outlet reports on Southeast Asia from outside it, that is admissible but
  should be scored lower and flagged, because such stories tend to quote agency
  staff rather than local church leaders.
- Be willing to approve with a documented caveat, or to reject something
  editorially excellent on technical grounds. Say so plainly in the reasoning.\
"""


def probe(url: str) -> dict:
    """Fetch whatever evidence we can about a candidate, without judging it."""
    headers = {"User-Agent": config.user_agent}
    evidence: dict = {"candidate_url": url, "probed_at": datetime.now(timezone.utc).isoformat()}

    try:
        home = requests.get(url, headers=headers, timeout=config.request_timeout)
        evidence["homepage_status"] = home.status_code
        html = home.text
    except Exception as exc:  # noqa: BLE001
        evidence["homepage_status"] = f"error: {exc}"
        return evidence

    # Feed discovery: the site's own <link rel="alternate"> first, then the
    # usual guesses. Christian Daily 404s on /rss and /feed but declares
    # /rss.xml in its head — guessing alone would have rejected it.
    soup = BeautifulSoup(html, "lxml")
    declared = [
        l.get("href") for l in soup.find_all("link", rel=lambda r: r and "alternate" in r)
        if l.get("type", "").endswith(("rss+xml", "atom+xml"))
    ]
    candidates = [h for h in declared if h] + [
        url.rstrip("/") + p for p in ("/feed/", "/rss.xml", "/feed", "/atom.xml", "/news/feed/")
    ]

    for feed_url in candidates:
        if not feed_url.startswith("http"):
            feed_url = url.rstrip("/") + feed_url
        try:
            r = requests.get(feed_url, headers=headers, timeout=config.request_timeout)
            if not r.ok:
                continue
            parsed = feedparser.parse(r.content)
            if not parsed.entries:
                continue

            items = []
            for e in parsed.entries[:12]:
                when = None
                for key in ("published_parsed", "updated_parsed"):
                    p = getattr(e, key, None)
                    if p:
                        when = datetime(*p[:6]).date().isoformat()
                        break
                items.append({"title": getattr(e, "title", "")[:160], "date": when})

            evidence.update({
                "feed_url": feed_url, "fetch_method": "rss",
                "item_count": len(parsed.entries), "recent_items": items,
            })

            # Pull one article's text so the model can judge content type rather
            # than guessing from headlines.
            link = getattr(parsed.entries[0], "link", None)
            if link:
                try:
                    art = requests.get(link, headers=headers, timeout=config.request_timeout)
                    text = trafilatura.extract(art.text, include_comments=False) or ""
                    evidence["sample_article_url"] = link
                    evidence["sample_article_text"] = text[:3000]
                except Exception:  # noqa: BLE001
                    evidence["sample_article_text"] = ""
            break
        except Exception:  # noqa: BLE001
            continue

    if "feed_url" not in evidence:
        # No feed. Check whether the homepage is server-rendered at all before
        # concluding anything — a guessed URL failing tells you about the guess,
        # not the site. That mistake cost Jawaban.com a wrongful rejection.
        links = soup.find_all("a", href=True)
        evidence.update({
            "fetch_method": "html_index",
            "server_rendered_links": len(links),
            "note": (
                f"No feed found. Homepage returned {len(links)} anchors in raw HTML. "
                "Many anchors means it is server-rendered and scrapeable with a "
                "source-specific handler; near zero suggests client rendering."
            ),
        })

    return evidence


def vet(name: str, url: str, country: str | None) -> dict | None:
    log.info("Probing %s …", url)
    evidence = probe(url)

    user = (
        f"CANDIDATE: {name}\nURL: {url}\nCOUNTRY: {country or 'regional / unknown'}\n\n"
        f"EVIDENCE GATHERED BY FETCHING THE SITE:\n{json.dumps(evidence, indent=2)[:12000]}\n"
    )
    result = llm.complete(VETTING_SYSTEM_PROMPT, user, kind="consolidation")
    if not result.ok:
        log.error("model call failed: %s", result.error)
        return None

    raw = re.sub(r"^```(?:json)?|```$", "", result.text.strip(), flags=re.M).strip()
    try:
        decision = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.error("model did not return valid JSON (%s):\n%s", exc, result.text[:600])
        return None

    decision["_evidence"] = evidence
    decision["_model"] = result.model
    return decision


def record(name: str, url: str, country: str | None, decision: dict, apply: bool) -> None:
    """Write the decision to the audit log, and optionally create the source row."""
    source_id = None

    if apply and decision.get("verdict") == "approved":
        ev = decision["_evidence"]
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        try:
            row = db.client().table("sources").upsert({
                "name": name, "slug": slug, "homepage_url": url,
                "feed_url": ev.get("feed_url"),
                "country_code": country, "is_regional": country is None,
                "denomination": decision.get("denomination", "Non-denominational"),
                "update_cadence": decision.get("update_cadence", "Unknown"),
                "primary_language": decision.get("primary_language", "en"),
                "needs_translation": decision.get("primary_language", "en") != "en",
                "fetch_method": ev.get("fetch_method", "rss"),
                "status": "approved",
                "credibility_score": int(decision.get("credibility_score", 50)),
            }, on_conflict="slug").execute().data
            source_id = row[0]["id"] if row else None
            log.info("sources row upserted for %s", name)
        except Exception as exc:  # noqa: BLE001
            log.error("could not upsert source: %s", exc)

    db.client().table("source_vetting_log").insert({
        "source_id": source_id,
        "candidate_name": name, "candidate_url": url, "country_code": country,
        "verdict": decision.get("verdict", "needs_recheck"),
        "decided_by": decision.get("_model", config.gemini_model),
        "criteria": decision.get("criteria", {}),
        "reasoning": decision.get("reasoning", ""),
        "evidence": [decision["_evidence"]],
        "model_version": decision.get("_model"),
    }).execute()
    log.info("vetting decision logged for %s", name)


def main() -> int:
    ap = argparse.ArgumentParser(description="Vet a candidate source for The 7000.")
    ap.add_argument("--url", help="Candidate homepage URL.")
    ap.add_argument("--name", help="Outlet name.")
    ap.add_argument("--country", help="ISO-3166-1 alpha-2 code, omitted for regional outlets.")
    ap.add_argument("--apply", action="store_true", help="Create/update the sources row on approval.")
    ap.add_argument("--recheck", action="store_true", help="Re-vet every currently approved source.")
    args = ap.parse_args()

    problems = config.validate()
    if problems:
        for p in problems:
            log.error("config: %s", p)
        return 2

    targets: list[tuple[str, str, str | None]] = []
    if args.recheck:
        targets = [(s.name, s.homepage_url, s.country_code) for s in db.approved_sources()]
        log.info("Re-vetting %d approved source(s)", len(targets))
    elif args.url:
        targets = [(args.name or args.url, args.url, (args.country or "").upper() or None)]
    else:
        ap.error("give --url (with --name) or --recheck")

    for name, url, country in targets:
        decision = vet(name, url, country)
        if decision is None:
            continue
        print()
        print("=" * 72)
        print(f"{name}  →  {decision.get('verdict', '?').upper()}  "
              f"(credibility {decision.get('credibility_score', '?')})")
        print("=" * 72)
        for key, val in (decision.get("criteria") or {}).items():
            mark = "PASS" if val.get("pass") else "FAIL"
            print(f"  [{mark}] {key}: {val.get('reasoning', '')[:200]}")
        print()
        print(decision.get("reasoning", "")[:2000])
        print()
        record(name, url, country, decision, args.apply)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
