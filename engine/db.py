"""Database access for the daily engine. Uses the service-role key, so RLS does not apply."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from functools import lru_cache

from supabase import create_client, Client

from config import config

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def client() -> Client:
    return create_client(config.supabase_url, config.supabase_key)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@dataclass
class Source:
    id: str
    name: str
    slug: str
    homepage_url: str
    feed_url: str | None
    country_code: str | None
    is_regional: bool
    fetch_method: str
    primary_language: str
    needs_translation: bool
    credibility_score: int
    source_perspective: str


def normalise_title(title: str) -> str:
    """
    Lowercase, strip punctuation and collapse whitespace.

    Used for the stored title hash so an outlet that republishes the same story
    under a new URL — or with smart quotes swapped for straight ones — is still
    recognised as already processed.
    """
    t = title.lower().strip()
    t = re.sub(r"[‘’“”]", "'", t)
    t = re.sub(r"[^a-z0-9\s']", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def title_hash(title: str) -> str:
    return hashlib.sha256(normalise_title(title).encode("utf-8")).hexdigest()


def canonicalise_url(url: str) -> str:
    """
    Strip tracking parameters and fragments so the same article arriving via a
    feed and via a category page compares equal.
    """
    url = url.split("#", 1)[0]
    if "?" not in url:
        return url.rstrip("/")
    base, query = url.split("?", 1)
    keep = [
        p for p in query.split("&")
        if p and not p.split("=", 1)[0].lower().startswith(("utm_", "fbclid", "gclid", "mc_cid", "mc_eid"))
    ]
    return (f"{base}?{'&'.join(keep)}" if keep else base).rstrip("/")


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def approved_sources() -> list[Source]:
    rows = client().table("sources").select("*").eq("status", "approved").execute().data or []
    return [
        Source(
            id=r["id"], name=r["name"], slug=r["slug"], homepage_url=r["homepage_url"],
            feed_url=r.get("feed_url"), country_code=r.get("country_code"),
            is_regional=r.get("is_regional", False), fetch_method=r.get("fetch_method", "rss"),
            primary_language=r.get("primary_language", "en"),
            needs_translation=r.get("needs_translation", False),
            credibility_score=r.get("credibility_score", 50),
            source_perspective=r.get("source_perspective", "local"),
        )
        for r in rows
    ]


def country_names() -> dict[str, str]:
    rows = client().table("countries").select("code, name").execute().data or []
    return {r["code"]: r["name"] for r in rows}


def already_processed(source_id: str, canonical_url: str, t_hash: str) -> bool:
    """
    True if this article has been seen before, by URL or by normalised title.

    The title check is deliberately global rather than per-source: if two
    outlets in the same stable run the identical headline, the second one has
    nothing new to add.
    """
    db = client()
    by_url = (
        db.table("processed_articles").select("id")
        .eq("source_id", source_id).eq("canonical_url", canonical_url)
        .limit(1).execute().data
    )
    if by_url:
        return True
    by_title = (
        db.table("processed_articles").select("id")
        .eq("title_hash", t_hash).limit(1).execute().data
    )
    return bool(by_title)


def confirmed_subscribers() -> list[dict]:
    return (
        client().table("subscribers")
        .select("email, unsubscribe_token")
        .eq("status", "confirmed")
        .execute().data or []
    )


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def mark_processed(source_id: str, canonical_url: str, title: str, selected: bool) -> None:
    try:
        client().table("processed_articles").insert({
            "source_id": source_id,
            "canonical_url": canonical_url,
            "title_hash": title_hash(title),
            "title": title[:500],
            "was_selected": selected,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        # A unique-constraint collision here is benign — it means a concurrent
        # or repeated run already recorded it, which is the desired end state.
        log.debug("mark_processed skipped for %s: %s", canonical_url, exc)


def log_scrape_failure(source_id: str | None, source_name: str, stage: str,
                       error: str, url: str | None = None) -> None:
    try:
        client().table("scrape_failures").insert({
            "source_id": source_id,
            "source_name": source_name,
            "stage": stage,
            "error_message": str(error)[:2000],
            "url": url,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        log.error("could not record scrape failure for %s: %s", source_name, exc)


def create_edition(edition_date: date) -> str:
    """
    Create (or reuse) today's edition row and return its id.

    Reuse matters: a re-run after a partial failure should continue the same
    edition rather than colliding with the unique constraint on edition_date.
    """
    db = client()
    existing = (
        db.table("editions").select("id, status")
        .eq("edition_date", edition_date.isoformat()).limit(1).execute().data
    )
    if existing:
        return existing[0]["id"]
    row = db.table("editions").insert({
        "edition_date": edition_date.isoformat(), "status": "building",
    }).execute().data
    return row[0]["id"]


def save_testimony(edition_id: str, country_code: str, source_id: str, title: str,
                   url: str, summary: str, rank: int, score: float,
                   published_at: datetime | None, translated: bool, language: str,
                   model: str, merged: list[str] | None = None,
                   original_title: str | None = None) -> str | None:
    payload = {
        "edition_id": edition_id, "country_code": country_code, "source_id": source_id,
        "title": title[:500], "original_url": url, "summary": summary, "rank": rank,
        "selection_score": round(score, 3),
        "article_published_at": published_at.isoformat() if published_at else None,
        "was_translated": translated, "original_language": language,
        "model_used": model, "merged_source_ids": merged or [],
        "original_title": original_title[:500] if original_title else None,
    }
    try:
        row = client().table("testimonies").insert(payload).execute().data
        return row[0]["id"] if row else None
    except Exception as exc:  # noqa: BLE001
        # Migration 0004 adds original_title. If it has not been applied yet,
        # save the testimony without it rather than losing the whole edition to
        # a missing nice-to-have column — the English title, which is the part
        # that actually matters, lives in `title` either way.
        if "original_title" in str(exc):
            log.warning("original_title column missing — apply migration 0004. "
                        "Saving without it for now.")
            payload.pop("original_title", None)
            try:
                row = client().table("testimonies").insert(payload).execute().data
                return row[0]["id"] if row else None
            except Exception as exc2:  # noqa: BLE001
                log.error("could not save testimony %r: %s", title[:60], exc2)
                return None
        log.error("could not save testimony %r: %s", title[:60], exc)
        return None


def save_country_summary(edition_id: str, country_code: str, summary: str) -> None:
    try:
        client().table("country_summaries").upsert(
            {"edition_id": edition_id, "country_code": country_code, "summary": summary},
            on_conflict="edition_id,country_code",
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.error("could not save country summary for %s: %s", country_code, exc)


def publish_edition(edition_id: str, consolidation: str | None,
                    recipients: int | None = None) -> None:
    client().table("editions").update({
        "status": "published",
        "consolidation_summary": consolidation,
        "email_sent_at": datetime.now().astimezone().isoformat() if recipients else None,
        "email_recipient_count": recipients,
    }).eq("id", edition_id).execute()


def mark_no_send(edition_id: str, reason: str) -> None:
    """
    A day where nothing qualified is recorded explicitly, not left as a gap.
    Otherwise "no testimonies today" and "the job never ran" look identical.
    """
    client().table("editions").update({
        "status": "no_send", "no_send_reason": reason,
    }).eq("id", edition_id).execute()
