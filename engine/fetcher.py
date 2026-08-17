"""
Fetching candidate articles from approved sources, and extracting clean text.

Failure policy, per the brief: retry once, then skip the source for the day and
record why. One outlet changing its markup must never take down an edition.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import feedparser
import requests
import trafilatura
from bs4 import BeautifulSoup

from config import config
from db import Source, canonicalise_url, log_scrape_failure

log = logging.getLogger(__name__)


@dataclass
class Candidate:
    source: Source
    title: str
    url: str
    published_at: datetime | None
    # Country is per-article for regional sources, per-source otherwise.
    country_code: str | None = None
    text: str | None = None


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": config.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en;q=0.9",
    })
    return s


def _get(session: requests.Session, url: str, *, retries: int = 1) -> requests.Response | None:
    """GET with one retry, as the brief specifies. Returns None on final failure."""
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = session.get(url, timeout=config.request_timeout)
            r.raise_for_status()
            return r
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < retries:
                time.sleep(1.5)
    log.warning("fetch failed for %s: %s", url, last)
    return None


def _parse_feed_date(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, key, None)
        if parsed:
            try:
                return datetime(*parsed[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                continue
    return None


# ---------------------------------------------------------------------------
# Candidate discovery
# ---------------------------------------------------------------------------

def _from_rss(session: requests.Session, source: Source) -> list[Candidate]:
    resp = _get(session, source.feed_url or "")
    if resp is None:
        log_scrape_failure(source.id, source.name, "feed_fetch",
                           "could not fetch feed after retry", source.feed_url)
        return []

    parsed = feedparser.parse(resp.content)
    if not parsed.entries:
        log_scrape_failure(source.id, source.name, "feed_fetch",
                           "feed parsed but contained no entries", source.feed_url)
        return []

    out: list[Candidate] = []
    for e in parsed.entries:
        link = getattr(e, "link", None)
        title = getattr(e, "title", None)
        if not link or not title:
            continue
        out.append(Candidate(
            source=source,
            title=title.strip(),
            url=canonicalise_url(link),
            published_at=_parse_feed_date(e),
            country_code=source.country_code,
        ))
    return out


# Jawaban encodes the publication date in the article path:
#   /read/article/id/YYYY/MM/DD/<category>/<timestamp>/<slug>
# which means no date parsing from page content is needed at all.
_JAWABAN_DATE = re.compile(r"/read/article/id/(\d{4})/(\d{2})/(\d{2})/")

# Category ids worth reading for testimony. 521 = ImpactStory, 1 = Inspiring.
_JAWABAN_CATEGORIES = ("521/ImpactStory.html", "1/Inspiring.html")


def _from_html_index(session: requests.Session, source: Source) -> list[Candidate]:
    """
    Scrape sources that publish no feed.

    Currently only Jawaban.com. Kept explicitly source-specific rather than
    pretending to be a general-purpose scraper: a generic "find the article
    links" heuristic would be fragile in a different way and harder to debug.
    """
    if "jawaban.com" not in source.homepage_url:
        log_scrape_failure(source.id, source.name, "feed_fetch",
                           f"no html_index handler for {source.homepage_url}", source.homepage_url)
        return []

    out: list[Candidate] = []
    seen: set[str] = set()

    for category in _JAWABAN_CATEGORIES:
        url = f"https://www.jawaban.com/archive/id/{category}"
        resp = _get(session, url)
        if resp is None:
            log_scrape_failure(source.id, source.name, "feed_fetch",
                               "could not fetch category index after retry", url)
            continue

        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.select('a[href*="/read/article/id/"]'):
            href = a.get("href") or ""
            if not href.startswith("http"):
                href = "https://www.jawaban.com" + href
            canon = canonicalise_url(href)
            if canon in seen:
                continue
            seen.add(canon)

            m = _JAWABAN_DATE.search(canon)
            published = None
            if m:
                try:
                    published = datetime(int(m[1]), int(m[2]), int(m[3]), tzinfo=timezone.utc)
                except ValueError:
                    published = None

            # The anchor text is often an image or empty; fall back to the slug,
            # which is a readable, underscore-separated version of the headline.
            title = a.get_text(strip=True)
            if not title or len(title) < 12:
                slug = canon.rstrip("/").rsplit("/", 1)[-1]
                title = slug.replace("_", " ").replace("-", " ").strip()
            if not title:
                continue

            out.append(Candidate(
                source=source, title=title[:500], url=canon,
                published_at=published, country_code=source.country_code,
            ))

    return out


def discover(source: Source) -> list[Candidate]:
    """All candidate articles currently advertised by a source."""
    session = _session()
    try:
        if source.fetch_method == "rss":
            return _from_rss(session, source)
        if source.fetch_method == "html_index":
            return _from_html_index(session, source)
        # 'spa_unscrapeable' sources are recorded for the audit trail but never
        # fetched. Reaching here means one was left approved by mistake.
        log.info("skipping %s: fetch_method=%s", source.name, source.fetch_method)
        return []
    except Exception as exc:  # noqa: BLE001
        log_scrape_failure(source.id, source.name, "feed_fetch", repr(exc), source.feed_url)
        return []
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Article text
# ---------------------------------------------------------------------------

MIN_ARTICLE_CHARS = 400


def fetch_text(candidate: Candidate) -> str | None:
    """
    Download an article and reduce it to title + body.

    trafilatura strips navigation, adverts and scripts, which matters for two
    reasons: the model gets signal instead of chrome, and we never hold more of
    the source's page than we need to summarise it.
    """
    session = _session()
    try:
        resp = _get(session, candidate.url)
        if resp is None:
            log_scrape_failure(candidate.source.id, candidate.source.name,
                               "article_fetch", "could not fetch article after retry", candidate.url)
            return None

        text = trafilatura.extract(
            resp.text,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
            favor_precision=True,
        )

        if not text or len(text) < MIN_ARTICLE_CHARS:
            log_scrape_failure(
                candidate.source.id, candidate.source.name, "extract",
                f"extracted only {len(text or '')} chars (minimum {MIN_ARTICLE_CHARS})",
                candidate.url,
            )
            return None

        # Cap what we send to the model. Testimony articles run well under this;
        # anything longer is usually a page that defeated the extractor.
        return text[:20000]
    except Exception as exc:  # noqa: BLE001
        log_scrape_failure(candidate.source.id, candidate.source.name,
                           "extract", repr(exc), candidate.url)
        return None
    finally:
        session.close()
