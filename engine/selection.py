"""
Choosing which candidates become today's testimonies.

THE SELECTION HEURISTIC, documented as the brief requires.

Each candidate gets a score out of roughly 100, from four components:

  RECENCY (0-40)
      Same-day 40, yesterday 34, two days 28, three days 22, then decaying
      slowly to 5 across the rest of the lookback window. The steep early
      cliff is deliberate: the brief asks that same-day and previous-day
      articles outrank older ones, and with a 30-day window a gentle curve
      would let a three-week-old backlog piece beat this morning's story.

  THEME FIT (0-30)
      Keyword evidence that this is a testimony rather than news — words like
      testimony, baptised, healed, answered prayer, calling. Counter-signals
      (earthquake, sentenced, arrested, conference, appointed) subtract. This
      is a cheap pre-filter, not the real judgement: the model still gets the
      final say via the NOT_A_TESTIMONY escape hatch, which is what catches
      the cases keywords get wrong.

  SPECIFICITY (0-15)
      Proxies for a story about identifiable people: quotation marks, personal
      pronouns, and capitalised name-like tokens in the title. The brief asks
      that articles reference identifiable pastors and church leaders, and a
      headline with a name in it is far more likely to deliver that.

  SOURCE STANDING (0-15)
      credibility_score scaled, minus a penalty for external-perspective
      outlets. Mission-agency reporting passes vetting but tends to quote
      agency staff rather than local church leaders, so where a local outlet
      and an external one both have something, the local one should win.

Ties break toward the more recent article, then the higher-credibility source.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from thefuzz import fuzz

from config import config
from fetcher import Candidate

log = logging.getLogger(__name__)

# --- Theme signals ---------------------------------------------------------

_POSITIVE = {
    "testimony": 8, "testimonies": 8, "baptis": 7, "saved": 4, "salvation": 5,
    "healed": 7, "healing": 6, "answered prayer": 8, "prayer": 3, "miracle": 6,
    "converted": 6, "came to faith": 8, "gave his life": 6, "gave her life": 6,
    "calling": 5, "called": 3, "church plant": 6, "discipleship": 4, "revival": 5,
    "forgave": 5, "forgiveness": 4, "restored": 5, "hope": 3, "faith": 3,
    "god provided": 8, "god's provision": 8, "encountered": 4, "transformed": 5,
}

# Words that mark a piece as news rather than testimony. These are the exact
# failure mode found in vetting: Christian Daily and Mission Network News carry
# real journalism about Southeast Asia, but mostly disasters and court cases.
_NEGATIVE = {
    "earthquake": -14, "tsunami": -14, "flood": -10, "typhoon": -12, "quake": -14,
    "sentenced": -14, "arrested": -12, "court": -10, "trial": -10, "jailed": -14,
    "persecut": -8, "killed": -12, "attack": -10, "banned": -8, "raid": -10,
    "conference": -7, "summit": -7, "appointed": -8, "elected": -8, "launch": -5,
    "webinar": -8, "registration": -8, "tickets": -8, "obituary": -10, "dies": -10,
    # Event promotion. Added after a smoke run against the real feeds ranked
    # "REVEL National, 7th-8th August 2026" as Malaysia's top story — a
    # forthcoming event, not a testimony. The model's NOT_A_TESTIMONY veto would
    # have caught it, but not before spending a call on it, and on a thin day it
    # would have crowded out a real story.
    "festival": -9, "upcoming": -9, "will be held": -10, "save the date": -12,
    "sign up": -8, "early bird": -10, "rsvp": -12, "join us": -7, "programme": -5,
    # Product and app write-ups — same failure mode, seen on the Singapore feed.
    "app": -4, "platform": -4, "launches": -6,
}

_NAME_LIKE = re.compile(r"\b[A-Z][a-z]{2,}\b")
_PRONOUNS = re.compile(r"\b(he|she|his|her|they|their|i|my)\b", re.I)


def _recency_points(published: datetime | None) -> float:
    if published is None:
        # Undated articles are not excluded, but they cannot compete with a
        # dated one. Most undated items turn out to be evergreen pages.
        return 8.0
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - published).total_seconds() / 86400
    if age_days < 1:
        return 40.0
    if age_days < 2:
        return 34.0
    if age_days < 3:
        return 28.0
    if age_days < 4:
        return 22.0
    # Slow decay across the rest of the window, floored at 5.
    span = max(config.lookback_days - 4, 1)
    return max(5.0, 22.0 - 17.0 * ((age_days - 4) / span))


def _theme_points(title: str, text: str | None) -> float:
    haystack = f"{title} {(text or '')[:2500]}".lower()
    score = 0.0
    for word, weight in _POSITIVE.items():
        if word in haystack:
            score += weight
    for word, weight in _NEGATIVE.items():
        if word in haystack:
            score += weight  # weights are already negative
    return max(0.0, min(30.0, score))


def _specificity_points(title: str, text: str | None) -> float:
    score = 0.0
    names = len(_NAME_LIKE.findall(title))
    score += min(7.0, names * 2.0)
    body = (text or "")[:4000]
    if '"' in body or "“" in body:
        score += 4.0  # someone is quoted
    if len(_PRONOUNS.findall(body)) > 6:
        score += 4.0  # a story about a person, not an institution
    return min(15.0, score)


def _standing_points(candidate: Candidate) -> float:
    base = (candidate.source.credibility_score / 100.0) * 15.0
    if candidate.source.source_perspective == "external":
        base -= 6.0
    elif candidate.source.source_perspective == "regional":
        base -= 2.0
    return max(0.0, base)


def score(candidate: Candidate) -> float:
    return (
        _recency_points(candidate.published_at)
        + _theme_points(candidate.title, candidate.text)
        + _specificity_points(candidate.title, candidate.text)
        + _standing_points(candidate)
    )


# ---------------------------------------------------------------------------
# Cross-source duplicate detection
# ---------------------------------------------------------------------------

def find_duplicates(candidates: list[Candidate]) -> list[list[int]]:
    """
    Group indices whose titles are near-identical.

    token_set_ratio rather than plain ratio: it ignores word order and repeated
    words, so "Pastor Lim's church feeds 400 families" and "400 families fed by
    Pastor Lim's church" match, which simple ratio would miss.

    This matters most between Salt&Light and Thir.st, which share a publisher
    and sometimes run companion pieces on the same event.
    """
    groups: list[list[int]] = []
    assigned: set[int] = set()

    for i in range(len(candidates)):
        if i in assigned:
            continue
        group = [i]
        for j in range(i + 1, len(candidates)):
            if j in assigned:
                continue
            if candidates[i].source.id == candidates[j].source.id:
                continue  # within one source, the processed_articles ledger already handles it
            ratio = fuzz.token_set_ratio(candidates[i].title, candidates[j].title)
            if ratio >= config.duplicate_threshold:
                group.append(j)
                assigned.add(j)
        if len(group) > 1:
            assigned.add(i)
            groups.append(group)

    return groups


def resolve_duplicates(candidates: list[Candidate]) -> tuple[list[Candidate], dict[str, list[str]]]:
    """
    Collapse duplicate groups, keeping the stronger candidate.

    Returns the surviving candidates plus a map of survivor-url -> the source
    ids that were folded into it, so the archive can credit both outlets.

    The brief asks to "attempt to merge into a single summary citing both
    sources; if merging doesn't make sense, keep the more detailed/credible
    source and skip the other." We do the second, and cite both. Genuinely
    merging two article texts into one summary would mean handing the model two
    sources and asking it to reconcile them, which is exactly the situation
    where fabrication risk is highest — and the strict no-invention rule is the
    thing this newsletter cannot afford to compromise.
    """
    groups = find_duplicates(candidates)
    if not groups:
        return candidates, {}

    drop: set[int] = set()
    merged: dict[str, list[str]] = {}

    for group in groups:
        ranked = sorted(
            group,
            key=lambda i: (score(candidates[i]), len(candidates[i].text or "")),
            reverse=True,
        )
        keeper, losers = ranked[0], ranked[1:]
        merged[candidates[keeper].url] = [candidates[i].source.id for i in losers]
        drop.update(losers)
        log.info(
            "duplicate: keeping %r (%s) over %s",
            candidates[keeper].title[:60], candidates[keeper].source.name,
            [candidates[i].source.name for i in losers],
        )

    return [c for i, c in enumerate(candidates) if i not in drop], merged


def top_n(candidates: list[Candidate], n: int) -> list[tuple[Candidate, float]]:
    scored = [(c, score(c)) for c in candidates]
    scored.sort(
        key=lambda pair: (
            pair[1],
            pair[0].published_at or datetime.min.replace(tzinfo=timezone.utc),
            pair[0].source.credibility_score,
        ),
        reverse=True,
    )
    return scored[:n]
