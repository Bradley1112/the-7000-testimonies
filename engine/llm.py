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
You are writing for "The 7000," a daily Christian newsletter that collects and
summarizes real testimonies of God's work happening today across Southeast Asia.

CONTEXT: The 7000 exists because testimonies of God's active work are scattered
across many small local outlets and rarely seen together. Named after 1 Kings
19:18 - when a discouraged Elijah believed he was the only faithful one left,
God told him 7,000 others had not bowed to Baal - this newsletter exists to
remind Protestant, non-denominational Christian readers that they are not
alone, and that God is still visibly moving today.

YOUR TASK: Summarize the testimony article provided below in 5-7 sentences.
The summary should be warm, encouraging, and grounded - never sensationalized
or exaggerated. It should make the reader want to click through and read the
full original article, not replace the need to read it.

STRICT RULES:
- Only use facts, names, and details explicitly present in the article text
  provided. Never invent or infer details not stated in the source.
- Do not fabricate quotes.
- If the article's claims are vague or unclear, keep your summary
  correspondingly modest - do not add certainty the source doesn't support.
- End with a short, natural invitation to read the full story.
- Do not use exclamation-point-heavy or "clickbait" language - the tone
  should be sincere, not hype-driven.
- Write in English regardless of the language of the source article. If the
  article is not in English, translate faithfully; do not embellish in
  translation, and keep proper nouns in their original form.
- Output only the summary itself. No preamble, no heading, no bullet points.

IMPORTANT: If the article is not actually a testimony - if it is a disaster
report, a persecution or court story, an event announcement, or general news -
respond with exactly the token NOT_A_TESTIMONY and nothing else. It is far
better to drop an article than to force news into a devotional register.\
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


def summarise_testimony(article_text: str, url: str, language: str = "en") -> Completion:
    """Returns a Completion whose text is the summary, or NOT_A_TESTIMONY."""
    note = ""
    if language and language != "en":
        note = f"\nNOTE: This article is written in language code '{language}'. Translate to English.\n"

    user = (
        f"{note}\nARTICLE TEXT:\n{article_text}\n\nORIGINAL SOURCE URL:\n{url}\n"
    )
    return complete(TESTIMONY_SYSTEM_PROMPT, user, kind="testimony")


def summarise_country(country_name: str, summaries: list[str]) -> Completion:
    joined = "\n\n".join(f"- {s}" for s in summaries)
    user = f"COUNTRY: {country_name}\n\nTODAY'S TESTIMONY SUMMARIES:\n{joined}\n"
    return complete(COUNTRY_SYSTEM_PROMPT, user, kind="country")


def consolidate(country_summaries: dict[str, str]) -> Completion:
    joined = "\n\n".join(f"{name}: {summary}" for name, summary in country_summaries.items())
    user = f"TODAY'S COUNTRY SUMMARIES:\n{joined}\n"
    return complete(CONSOLIDATION_SYSTEM_PROMPT, user, kind="consolidation")
