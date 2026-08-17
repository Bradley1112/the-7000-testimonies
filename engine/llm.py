"""
Model access, behind one function.

Everything that talks to a model goes through `complete()`. Switching provider
is LLM_PROVIDER in the environment — no call sites change. That is the brief's
requirement: if Gemini's tone or faithfulness disappoints in real use, moving
the summarisation to Claude Haiku is a config edit, not a rewrite.

Cost control, per the brief:
  * The fixed instruction block is passed as a separate system prompt rather
    than glued onto each article, so both providers can cache it across calls.
    It is identical on every request in a run, which is exactly what caching
    wants.
  * Batch APIs are deliberately NOT used. See the note in run_daily.py — at this
    volume the 50% saving is a fraction of a cent against a real cost in
    latency and complexity, and the daily job is already asynchronous.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass

from config import config

log = logging.getLogger(__name__)


@dataclass
class Completion:
    text: str
    model: str
    ok: bool
    error: str | None = None


# ---------------------------------------------------------------------------
# Prompts. Taken from the brief, with the additions the vetting round showed
# were needed: translation, and the single-country case.
# ---------------------------------------------------------------------------

TESTIMONY_SYSTEM_PROMPT = """\
You are writing for "The 7000," a daily Christian newsletter that collects real
testimonies of God's work happening today across Southeast Asia.

CONTEXT: The 7000 exists because testimonies of God's active work are scattered
across many small local outlets and rarely seen together. Named after 1 Kings
19:18 - when a discouraged Elijah believed he was the only faithful one left,
God told him 7,000 others had not bowed to Baal - this newsletter exists to
remind Protestant, non-denominational Christian readers that they are not
alone, and that God is still visibly moving today.

=== STEP 1: IS THIS ACTUALLY A TESTIMONY? ===

A testimony tells what God has done in the life of a specific, identifiable
person. It needs BOTH: a real person, and something that actually happened to
them.

The following are NOT testimonies. Reject them:
  - Bible teaching, exposition, or commentary about a passage or a biblical
    figure. An article about Daniel, Esther or Paul is teaching about the
    Bible, not a testimony of God at work today - no matter how edifying.
  - Devotional reflections, general encouragement, or lessons drawn from an
    experience where no specific person's story is actually told.
  - News: disasters, court cases, persecution, politics, appointments.
  - Event announcements, conference reports, product launches, book releases.
  - Opinion columns, advice pieces, or listicles.

If the article is not a testimony, respond with exactly:
NOT_A_TESTIMONY
and nothing else.

Be strict. When in doubt, reject. A day with fewer testimonies is far better
than a day with something that is not a testimony dressed up as one - that is
the single failure this newsletter cannot afford.

=== STEP 2: IF IT IS A TESTIMONY, WRITE THIS EXACT FORMAT ===

TITLE: <the article's headline, in English>
SUMMARY: <5-7 sentences>

Output nothing else. No preamble, no markdown, no bullet points.

--- TITLE RULES ---
- ALWAYS in English. If the original headline is in another language, translate
  it into natural English. Never leave it in the original language, and never
  transliterate it.
- Stay close to the original meaning. Do not sensationalise it.
- Keep personal names, place names and organisation names as they are.

--- VOICE RULES (these were the most common failure) ---
- Write in the third person throughout. NEVER switch person partway through.
- NEVER write as though you are the subject. Do not write "I fell", "my knees",
  "we prayed". The subject is someone else and you are telling their story.
- Tell the story directly. NEVER refer to the article or its author. Banned
  phrases: "the author", "the writer", "this article", "the piece", "the story
  describes", "the article notes", "he explains that". The reader should feel
  they are being told what happened, not handed a book report about a web page.
- Name the person the story is about, if the article names them. Use their
  name - not "a 23-year-old" or "the author" or "one believer".

--- TONE RULES ---
- Warm, encouraging and grounded. Sincere, never hyped.
- No exclamation marks. No clickbait phrasing.
- Prefer the concrete over the abstract: say what actually happened to this
  person, rather than the general lesson a reader might draw.
- End with a short, natural invitation to read the full story. Vary how you
  word it - do not reuse the same closing sentence every time.

--- FAITHFULNESS RULES ---
- Only use facts, names and details explicitly present in the article text.
  Never invent or infer anything the source does not state.
- Do not fabricate quotes.
- If the article's claims are vague, keep your summary correspondingly modest.
  Do not add certainty the source does not support.\
"""

COUNTRY_SYSTEM_PROMPT = """\
You are writing for "The 7000," a daily Christian newsletter collecting
testimonies of God's work across Southeast Asia (see 1 Kings 19:18).

You will be given the summaries of today's testimonies from a single country.
Write 1-2 sentences capturing what the day's testimonies from that country
showed, taken together.

STRICT RULES:
- Base this only on the summaries provided. Introduce no new facts.
- Do not overstate. If there is only one testimony, simply reflect it.
- Write in the third person. Never refer to "the testimony", "the article",
  "the story" or "the summary" - speak about the people and what happened to
  them, not about the text you were given.
- Warm and grounded, never hyped. No exclamation marks.
- No preamble or heading. Output the sentences only.\
"""

CONSOLIDATION_SYSTEM_PROMPT = """\
You are writing the closing section of "The 7000," a daily Christian
newsletter (see project context: named after 1 Kings 19:18, reminding readers
they are not alone in seeing God's work today).

You will be given today's per-country summaries from across Southeast Asia.
Write a single consolidation summary (up to ~8 sentences) that draws these
threads together into a picture of how God appears to be moving across the
region today. Where it feels natural (not forced into every entry), you may
tie back to the 1 Kings 19:18 theme of not being alone.

STRICT RULES:
- Base this only on the country summaries provided - do not introduce facts,
  countries, or events not present in them.
- Avoid overstating patterns across countries that aren't actually there.
- Keep the tone reflective and encouraging, not triumphalist.
- If summaries from only ONE country are provided, do not write as though you
  are describing a regional pattern. Reflect honestly on that one country's
  testimonies instead. Never imply breadth the material does not support.
- Write in the third person. Never refer to "the testimony", "the summaries",
  "the article" or "the stories provided" - write about the people and what
  God did, not about the text you were handed.
- No exclamation marks.
- No preamble or heading. Output the summary only.\
"""

# Generous ceilings, per the brief: length is controlled by the sentence-count
# instruction in the prompt, not by clipping the model mid-thought.
MAX_TOKENS = {"testimony": 400, "country": 120, "consolidation": 600}
TEMPERATURE = 0.35  # factual but not robotic


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

_gemini_client = None
_anthropic_client = None


def _gemini(system: str, user: str, max_tokens: int) -> Completion:
    global _gemini_client
    from google import genai
    from google.genai import types

    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=config.gemini_api_key)

    resp = _gemini_client.models.generate_content(
        model=config.gemini_model,
        contents=user,
        config=types.GenerateContentConfig(
            # Passing the fixed block as a system instruction (rather than
            # concatenating it into `contents`) is what makes it cacheable.
            system_instruction=system,
            temperature=TEMPERATURE,
            max_output_tokens=max_tokens,
            # Gemini 3.x models spend part of max_output_tokens on invisible
            # reasoning before emitting anything. Measured on 2026-08-17: a
            # 400-token budget produced 380 thinking tokens and 16 visible
            # ones, truncating every summary mid-sentence (finishReason
            # MAX_TOKENS). The brief's token budgets were sized for the older
            # non-thinking 2.5-flash.
            #
            # thinking_budget=0 disables it outright — verified 0 thought
            # tokens and finishReason STOP. thinking_level="low" is NOT a
            # substitute; it still burned 384 tokens in the same test.
            #
            # Faithful summarisation under strict no-invention rules is a
            # constrained rewriting task, not one that benefits from chain of
            # thought, so nothing of value is lost here.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    text = (resp.text or "").strip()
    if not text:
        return Completion("", config.gemini_model, False, "empty response")
    return Completion(text, config.gemini_model, True)


def _anthropic(system: str, user: str, max_tokens: int) -> Completion:
    global _anthropic_client
    import anthropic

    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=config.anthropic_api_key)

    resp = _anthropic_client.messages.create(
        model=config.anthropic_model,
        max_tokens=max_tokens,
        temperature=TEMPERATURE,
        # cache_control on the system block means the fixed instructions are
        # billed at the cheaper cached rate for every call after the first.
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    text = "".join(parts).strip()
    if not text:
        return Completion("", config.anthropic_model, False, "empty response")
    return Completion(text, config.anthropic_model, True)


def _groq(system: str, user: str, max_tokens: int) -> Completion:
    """
    Groq — free tier, no card required, and fast (sub-second on small models).

    Uses plain `requests` against Groq's OpenAI-compatible endpoint rather than
    the groq SDK: it is one HTTP POST, `requests` is already a dependency, and
    avoiding another package keeps the GitHub Actions install lean.

    No thinking-token workaround is needed here — the Llama models Groq serves
    are not reasoning models, so max_tokens means what it says.
    """
    import requests

    key = config.groq_api_key
    if not key:
        return Completion("", config.groq_model, False, "GROQ_API_KEY is not set.")

    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": config.groq_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": TEMPERATURE,
            "max_tokens": max_tokens,
            # gpt-oss models reason before answering, in a separate field that
            # does not eat max_tokens the way Gemini's thinking tokens do — but
            # it still costs latency and some of the completion budget for no
            # benefit on a faithful-rewrite task. "low" measured at ~10
            # reasoning tokens vs ~140 on the default, with no quality loss on
            # a real testimony article.
            "reasoning_effort": "low",
        },
        timeout=config.request_timeout,
    )

    if not resp.ok:
        return Completion("", config.groq_model, False, f"{resp.status_code} {resp.text[:300]}")

    data = resp.json()
    text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    if not text:
        return Completion("", config.groq_model, False, "empty response")
    return Completion(text, config.groq_model, True)


def complete(system: str, user: str, kind: str = "testimony", retries: int = 2) -> Completion:
    """
    Single entry point for all model calls.

    Retries transient failures with a short backoff. A model failure is never
    allowed to raise: the daily job must continue and simply drop whatever it
    could not summarise, rather than failing an entire edition over one article.
    """
    max_tokens = MAX_TOKENS.get(kind, 400)
    provider = config.llm_provider

    providers = {
        "gemini": (_gemini, config.gemini_model),
        "anthropic": (_anthropic, config.anthropic_model),
        "groq": (_groq, config.groq_model),
    }
    fn, model_name = providers.get(provider, (_gemini, config.gemini_model))

    last_error = "not attempted"
    for attempt in range(retries + 1):
        try:
            return fn(system, user, max_tokens)
        except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
            last_error = f"{type(exc).__name__}: {exc}"
            log.warning("LLM call failed (attempt %d/%d): %s", attempt + 1, retries + 1, last_error)
            if attempt < retries:
                time.sleep(2 ** attempt)

    return Completion("", model_name, False, last_error)


@dataclass
class TestimonySummary:
    """Parsed result of a testimony summarisation."""
    ok: bool
    is_testimony: bool
    title: str = ""       # always English
    summary: str = ""
    model: str = ""
    error: str | None = None


# The model is asked for "TITLE: ...\nSUMMARY: ...". Tolerate the usual drift:
# markdown bold, leading hashes, different capitalisation.
_TITLE_RE = re.compile(r"^\s*(?:[#*\s]*)title\s*[:\-]\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
_SUMMARY_RE = re.compile(r"^\s*(?:[#*\s]*)summary\s*[:\-]\s*(.*)$", re.IGNORECASE | re.MULTILINE | re.DOTALL)


def _strip_markup(s: str) -> str:
    return s.replace("**", "").replace("*", "").strip().strip('"').strip()


def summarise_testimony(article_text: str, url: str, language: str = "en",
                        fallback_title: str = "") -> TestimonySummary:
    """
    Summarise one article, returning an English title and body, or a
    not-a-testimony verdict.

    The title comes back from the model rather than being taken from the feed
    because a non-English source would otherwise pair an English summary with
    an untranslated headline — which is exactly what shipped in the first real
    test send.
    """
    note = ""
    if language and language != "en":
        note = (
            f"\nNOTE: This article is written in language code '{language}'. "
            f"Translate BOTH the title and the summary into English.\n"
        )

    user = f"{note}\nARTICLE TEXT:\n{article_text}\n\nORIGINAL SOURCE URL:\n{url}\n"
    result = complete(TESTIMONY_SYSTEM_PROMPT, user, kind="testimony")

    if not result.ok:
        return TestimonySummary(ok=False, is_testimony=False, model=result.model, error=result.error)

    text = result.text.strip()

    if "NOT_A_TESTIMONY" in text.upper():
        return TestimonySummary(ok=True, is_testimony=False, model=result.model)

    title_match = _TITLE_RE.search(text)
    summary_match = _SUMMARY_RE.search(text)

    title = _strip_markup(title_match.group(1)) if title_match else ""
    summary = _strip_markup(summary_match.group(1)) if summary_match else ""

    # If the model ignored the format entirely, treat the whole response as the
    # summary rather than discarding usable work, and fall back to the source's
    # own headline. Losing a good summary to a formatting slip would be worse
    # than an occasionally untranslated title.
    if not summary:
        summary = _strip_markup(text)
        title = title or fallback_title

    if not summary:
        return TestimonySummary(ok=False, is_testimony=False, model=result.model,
                                error="model returned no usable summary")

    return TestimonySummary(
        ok=True, is_testimony=True,
        title=title or fallback_title,
        summary=summary,
        model=result.model,
    )


def summarise_country(country_name: str, summaries: list[str]) -> Completion:
    joined = "\n\n".join(f"- {s}" for s in summaries)
    user = f"COUNTRY: {country_name}\n\nTODAY'S TESTIMONY SUMMARIES:\n{joined}\n"
    return complete(COUNTRY_SYSTEM_PROMPT, user, kind="country")


def consolidate(country_summaries: dict[str, str]) -> Completion:
    joined = "\n\n".join(f"{name}: {summary}" for name, summary in country_summaries.items())
    user = f"TODAY'S COUNTRY SUMMARIES:\n{joined}\n"
    return complete(CONSOLIDATION_SYSTEM_PROMPT, user, kind="consolidation")
