#!/usr/bin/env python3
"""
The daily engine.

    python engine/run_daily.py                # full run
    python engine/run_daily.py --dry-run      # build the edition, send only to the test address
    python engine/run_daily.py --no-send      # build and store, send nothing
    python engine/run_daily.py --preview out.html   # also write the email to a file

Order of operations, matching the brief:
  discover -> skip already-processed -> extract text -> dedupe across sources
  -> score and take the top N per country -> summarise each -> summarise each
  country -> consolidate -> store -> send.

On why the Batch API is not used, despite the brief suggesting it: a batch job
trades latency for a ~50% discount. This run summarises on the order of ten
articles a day. At Gemini 2.5 Flash pricing that is fractions of a cent, so the
saving is worth roughly a few cents a year, against submitting a job, polling
for completion, and handling partial results inside a scheduled window that has
to land before 7am. Prompt caching is used, because that costs nothing in
complexity. If volume ever grows by two orders of magnitude, revisit this.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import defaultdict

# Allow running as `python engine/run_daily.py` from the repo root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db  # noqa: E402
import llm  # noqa: E402
import selection  # noqa: E402
from config import config  # noqa: E402
from email_render import EmailCountry, EmailTestimony, render_digest  # noqa: E402
from fetcher import Candidate, discover, fetch_text  # noqa: E402
from mailer import send_digest  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("run_daily")

NOT_A_TESTIMONY = "NOT_A_TESTIMONY"


def gather_candidates() -> dict[str, list[Candidate]]:
    """Discover candidates from every approved source, grouped by country."""
    sources = db.approved_sources()
    if not sources:
        log.error("No approved sources. Apply the migrations, or run vet_sources.py.")
        return {}

    log.info("Reading %d approved source(s)", len(sources))
    by_country: dict[str, list[Candidate]] = defaultdict(list)
    cutoff = config.lookback_cutoff()

    for source in sources:
        found = discover(source)
        log.info("  %-30s %3d candidate(s)", source.name, len(found))

        for cand in found:
            if cand.published_at and cand.published_at < cutoff:
                continue

            canon = db.canonicalise_url(cand.url)
            if db.already_processed(source.id, canon, db.title_hash(cand.title)):
                continue

            # A regional source has no country of its own; work it out from the
            # article. Anything we cannot place is dropped rather than guessed.
            country = cand.country_code
            if source.is_regional:
                country = infer_country(cand.title)
                if country is None:
                    continue

            cand.url = canon
            cand.country_code = country
            by_country[country].append(cand)

    return by_country


_COUNTRY_HINTS = {
    "SG": ("singapore", "singaporean"),
    "MY": ("malaysia", "malaysian", "kuala lumpur", "sabah", "sarawak", "penang"),
    "ID": ("indonesia", "indonesian", "jakarta", "java", "sumatra", "papua", "flores"),
    "PH": ("philippine", "filipino", "manila", "cebu", "mindanao", "davao"),
    "TH": ("thailand", "thai", "bangkok", "chiang mai"),
    "VN": ("vietnam", "vietnamese", "hanoi", "ho chi minh"),
    "KH": ("cambodia", "cambodian", "phnom penh", "khmer", "siem reap"),
    "LA": ("laos", "laotian", "vientiane"),
    "MM": ("myanmar", "burma", "burmese", "yangon", "chin state"),
    "BN": ("brunei",),
    "TL": ("timor-leste", "east timor", "timorese", "dili"),
}


def infer_country(title: str) -> str | None:
    """Place a regional outlet's article by the country it names in its headline."""
    lowered = title.lower()
    for code, hints in _COUNTRY_HINTS.items():
        if any(h in lowered for h in hints):
            return code
    return None


def build_country(edition_id: str, code: str, name: str,
                  candidates: list[Candidate]) -> list[EmailTestimony]:
    """
    Fetch, dedupe, select, summarise and store one country's testimonies.

    processed_articles is written to in exactly two situations, both genuine
    editorial decisions: an article that competed in scoring and lost to a
    better candidate, or an article the model actually read and judged not to
    be a testimony. Both are legitimate reasons never to reconsider it.

    It is deliberately NOT written to when extraction fails or the model call
    fails — those are infrastructure problems, not judgments about the
    article. A run caught in an LLM outage (as happened once during setup,
    when the configured model had been retired) must not permanently
    blacklist every article it touched that day; the fix is for tomorrow's run
    to see the same candidates again with working infrastructure.
    """
    log.info("%s — %d candidate(s) inside the window", name, len(candidates))

    # Text first: the scorer reads the body for specificity and theme signals,
    # and the deduper compares more accurately with text available.
    with_text: list[Candidate] = []
    for cand in candidates[:25]:  # cap the fetch budget per country per day
        text = fetch_text(cand)
        if text:
            cand.text = text
            with_text.append(cand)
        # else: extraction failed. Left unmarked on purpose — see docstring.

    if not with_text:
        log.info("%s — nothing extractable today", name)
        return []

    survivors, merged = selection.resolve_duplicates(with_text)
    chosen = selection.top_n(survivors, config.max_per_country)
    chosen_urls = {c.url for c, _ in chosen}

    # Everything that was actually scored and lost is a real decision: mark it
    # now so it is not re-fetched and re-scored every day for the rest of the
    # lookback window.
    for cand in survivors:
        if cand.url not in chosen_urls:
            db.mark_processed(cand.source.id, cand.url, cand.title, selected=False)

    out: list[EmailTestimony] = []
    rank = 0
    source_names = {s.id: s.name for s in db.approved_sources()}

    for cand, sc in chosen:
        result = llm.summarise_testimony(
            cand.text or "", cand.url, cand.source.primary_language,
            fallback_title=cand.title,
        )

        if not result.ok:
            log.warning("summary failed for %r: %s", cand.title[:60], result.error)
            db.log_scrape_failure(cand.source.id, cand.source.name, "summarise",
                                  result.error or "unknown", cand.url)
            # Not marked processed — a model/infra failure, not a verdict on
            # the article. See docstring.
            continue

        # The model's own veto. This is the backstop that catches what the
        # keyword heuristic gets wrong — a persecution story that scored well
        # on recency and source standing still gets dropped here.
        if not result.is_testimony:
            log.info("model rejected as non-testimony: %r", cand.title[:70])
            # This IS a real decision — the model read actual content and
            # judged it non-testimony — so it is excluded going forward.
            db.mark_processed(cand.source.id, cand.url, cand.title, selected=False)
            continue

        # The model returns an English title; for non-English sources that is a
        # translation of the outlet's headline. Keep the original so a reader
        # clicking through recognises what they land on.
        english_title = result.title or cand.title
        translated = cand.source.needs_translation and english_title != cand.title
        original_title = cand.title if translated else None

        rank += 1
        merged_ids = merged.get(cand.url, [])
        db.save_testimony(
            edition_id=edition_id, country_code=code, source_id=cand.source.id,
            title=english_title, url=cand.url, summary=result.summary, rank=rank, score=sc,
            published_at=cand.published_at, translated=translated,
            language=cand.source.primary_language, model=result.model, merged=merged_ids,
            original_title=original_title,
        )
        db.mark_processed(cand.source.id, cand.url, cand.title, selected=True)

        out.append(EmailTestimony(
            title=english_title,
            summary=result.summary,
            url=cand.url,
            source_name=cand.source.name,
            also_from=[source_names.get(i, "another outlet") for i in merged_ids],
            translated_from=(cand.source.primary_language if translated else None),
        ))

    log.info("%s — %d testimon%s selected", name, len(out), "y" if len(out) == 1 else "ies")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and send today's edition of The 7000.")
    parser.add_argument("--dry-run", action="store_true", help="Send only to EMAIL_TEST_RECIPIENT.")
    parser.add_argument("--no-send", action="store_true", help="Build and store, but send nothing.")
    parser.add_argument("--preview", metavar="PATH", help="Write the rendered email to a file.")
    args = parser.parse_args()

    problems = config.validate()
    if problems:
        for p in problems:
            log.error("config: %s", p)
        return 2

    if args.dry_run:
        object.__setattr__(config, "dry_run_send", True)

    edition_date = config.today()
    log.info("Building the edition for %s (SGT)", edition_date)

    edition_id = db.create_edition(edition_date)
    names = db.country_names()

    candidates = gather_candidates()
    if not candidates:
        db.mark_no_send(edition_id, "No candidate articles found in any source.")
        log.warning("No candidates anywhere. Recorded as a no-send day.")
        return 0

    countries: list[EmailCountry] = []
    country_summary_text: dict[str, str] = {}

    for code, cands in candidates.items():
        name = names.get(code, code)
        testimonies = build_country(edition_id, code, name, cands)
        if not testimonies:
            continue  # countries with nothing today are simply omitted

        summary = None
        result = llm.summarise_country(name, [t.summary for t in testimonies])
        if result.ok:
            summary = result.text
            db.save_country_summary(edition_id, code, summary)
            country_summary_text[name] = summary
        else:
            log.warning("country summary failed for %s: %s", name, result.error)

        countries.append(EmailCountry(name=name, summary=summary, testimonies=testimonies))

    # Thin-day rule: send as long as at least one country qualified.
    if not countries:
        db.mark_no_send(edition_id, "Candidates were found, but none survived extraction, "
                                    "de-duplication and the model's testimony check.")
        log.warning("Zero countries qualified. Recorded as a no-send day — no email sent.")
        return 0

    countries.sort(key=lambda c: len(c.testimonies), reverse=True)

    consolidation = None
    if country_summary_text:
        result = llm.consolidate(country_summary_text)
        if result.ok:
            consolidation = result.text
        else:
            log.warning("consolidation failed: %s", result.error)

    subscribers = db.confirmed_subscribers()
    # A representative unsubscribe link for the preview/plain-text render; the
    # real per-subscriber link is substituted inside send_digest.
    preview_unsub = f"{config.site_url}/api/unsubscribe?token=PREVIEW"
    subject, html_doc, text = render_digest(edition_date, countries, consolidation, preview_unsub)

    total = sum(len(c.testimonies) for c in countries)
    log.info("Edition ready: %d testimon%s across %d countr%s",
             total, "y" if total == 1 else "ies",
             len(countries), "y" if len(countries) == 1 else "ies")

    if args.preview:
        with open(args.preview, "w", encoding="utf-8") as fh:
            fh.write(html_doc)
        log.info("Preview written to %s", args.preview)

    sent = 0
    if args.no_send:
        log.info("--no-send: stored the edition, sent nothing.")
    elif not subscribers and not config.dry_run_send:
        log.warning("No confirmed subscribers — nothing to send.")
    else:
        sent = send_digest(subscribers, subject, html_doc, text)

    db.publish_edition(edition_id, consolidation, sent or None)
    log.info("Published %s. Sent to %d recipient(s).", edition_date, sent)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
