#!/usr/bin/env python3
"""
Offline smoke test for the daily engine.

    python engine/smoke_test.py [--preview out.html]

Exercises the whole pipeline against the REAL sources — feed discovery, article
fetch, trafilatura extraction, scoring, cross-source de-duplication and email
rendering — while stubbing out the two things that cost money or need
credentials: the database and the model.

This is what to run first on a new machine. It proves the plumbing works before
any API key exists, and it is the fastest way to tell whether a source has
changed its markup.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db  # noqa: E402
import llm  # noqa: E402
import selection  # noqa: E402
from email_render import EmailCountry, EmailTestimony, render_digest  # noqa: E402
from fetcher import discover, fetch_text  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("smoke")

# The four sources approved in vetting, hard-coded so this runs with no database.
SOURCES = [
    db.Source(id="sl", name="Salt&Light", slug="salt-and-light",
              homepage_url="https://saltandlight.sg/", feed_url="https://saltandlight.sg/feed/",
              country_code="SG", is_regional=False, fetch_method="rss", primary_language="en",
              needs_translation=False, credibility_score=90, source_perspective="local"),
    db.Source(id="th", name="Thir.st", slug="thirst",
              homepage_url="https://thirst.sg/", feed_url="https://thirst.sg/feed/",
              country_code="SG", is_regional=False, fetch_method="rss", primary_language="en",
              needs_translation=False, credibility_score=82, source_perspective="local"),
    db.Source(id="jw", name="Jawaban.com", slug="jawaban",
              homepage_url="https://www.jawaban.com/", feed_url=None,
              country_code="ID", is_regional=False, fetch_method="html_index", primary_language="id",
              needs_translation=True, credibility_score=75, source_perspective="local"),
    db.Source(id="cm", name="Christianity Malaysia", slug="christianity-malaysia",
              homepage_url="https://christianitymalaysia.com/wp/",
              feed_url="https://christianitymalaysia.com/wp/feed/",
              country_code="MY", is_regional=False, fetch_method="rss", primary_language="en",
              needs_translation=True, credibility_score=62, source_perspective="local"),
]

COUNTRY_NAMES = {"SG": "Singapore", "ID": "Indonesia", "MY": "Malaysia"}


def stub_everything() -> None:
    """Replace the database and the model with no-ops that keep the pipeline honest."""
    db.log_scrape_failure = lambda *a, **k: log.warning("  scrape failure: %s", a[2:4])
    db.mark_processed = lambda *a, **k: None
    db.already_processed = lambda *a, **k: False
    db.approved_sources = lambda: SOURCES

    def fake_complete(system: str, user: str, kind: str = "testimony", retries: int = 2):
        if kind == "testimony":
            # Echo the opening of the real extracted text, so the preview shows
            # genuine article content rather than lorem ipsum — that is what
            # makes rendering problems visible.
            body = user.split("ARTICLE TEXT:", 1)[-1].strip()
            snippet = " ".join(body.split()[:60])
            return llm.Completion(f"[STUB SUMMARY] {snippet}…", "stub", True)
        if kind == "country":
            return llm.Completion("[STUB] A short reflection on the day's testimonies here.", "stub", True)
        return llm.Completion(
            "[STUB] A closing reflection drawing the day's threads together.", "stub", True)

    llm.complete = fake_complete


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", default="preview.html", help="Where to write the rendered email.")
    parser.add_argument("--per-source", type=int, default=3, help="Articles to fetch per source.")
    args = parser.parse_args()

    stub_everything()

    by_country: dict[str, list] = {}
    for source in SOURCES:
        found = discover(source)
        log.info("%-24s %3d candidates", source.name, len(found))
        if not found:
            log.error("  ^^ NO CANDIDATES — this source may have changed its markup")
        for cand in found[: args.per_source]:
            by_country.setdefault(source.country_code, []).append(cand)

    countries: list[EmailCountry] = []
    for code, cands in by_country.items():
        log.info("--- %s ---", COUNTRY_NAMES.get(code, code))

        with_text = []
        for cand in cands:
            text = fetch_text(cand)
            if text:
                cand.text = text
                with_text.append(cand)
                log.info("  extracted %5d chars  %s", len(text), cand.title[:58])
            else:
                log.warning("  extraction FAILED       %s", cand.title[:58])

        if not with_text:
            continue

        survivors, merged = selection.resolve_duplicates(with_text)
        chosen = selection.top_n(survivors, 3)

        testimonies = []
        for cand, sc in chosen:
            result = llm.summarise_testimony(cand.text or "", cand.url, cand.source.primary_language)
            log.info("  score %5.1f  %s", sc, cand.title[:58])
            testimonies.append(EmailTestimony(
                title=cand.title, summary=result.text, url=cand.url,
                source_name=cand.source.name,
                also_from=[], translated_from=cand.source.primary_language if cand.source.needs_translation else None,
            ))

        countries.append(EmailCountry(
            name=COUNTRY_NAMES.get(code, code),
            summary=llm.summarise_country(COUNTRY_NAMES.get(code, code), []).text,
            testimonies=testimonies,
        ))

    if not countries:
        log.error("Nothing survived. Every source failed — check network and source markup.")
        return 1

    subject, html_doc, text = render_digest(
        date.today(), countries, llm.consolidate({}).text,
        "https://example.com/api/unsubscribe?token=SMOKE",
    )

    with open(args.preview, "w", encoding="utf-8") as fh:
        fh.write(html_doc)

    print()
    print("=" * 72)
    print("SUBJECT:", subject)
    print("=" * 72)
    print(text[:1200])
    print("=" * 72)
    print(f"HTML preview written to {args.preview} ({len(html_doc) / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
