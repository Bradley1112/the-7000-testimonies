"""Configuration for the daily engine, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

# The newsletter's home timezone. Editions are dated by the Singapore calendar
# day, and the send is scheduled for 07:00 here, so every date boundary in the
# engine is SGT rather than UTC. Getting this wrong shifts an edition by a day.
SGT = ZoneInfo("Asia/Singapore")

# Several sources (Salt&Light, Mission Network News) return 403 to the default
# requests/urllib user agent. This is not an attempt to evade anything — it is
# an ordinary browser UA plus a contact address so operators can reach us.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 "
    "(The7000/1.0; +mailto:{contact})"
)


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    # --- Database ---------------------------------------------------------
    supabase_url: str = field(default_factory=lambda: os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
    supabase_key: str = field(default_factory=lambda: os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))

    # --- Model ------------------------------------------------------------
    llm_provider: str = field(default_factory=lambda: os.environ.get("LLM_PROVIDER", "gemini").lower())
    gemini_api_key: str = field(default_factory=lambda: os.environ.get("GEMINI_API_KEY", ""))
    # gemini-2.5-flash, the model named in the original brief, returns 404
    # "no longer available to new users" for any API key created after Google
    # retired it from new-user access — confirmed 2026-08-17 against a live key.
    # gemini-3.7-flash is the current stable, non-preview flash-tier model.
    # Deliberately not "gemini-flash-latest": an alias that can silently move
    # under a scheduled job is the wrong trade for something that needs
    # consistent tone day to day. If Google retires this one too, the fix is
    # the same one-line env var change, not a rewrite.
    gemini_model: str = field(default_factory=lambda: os.environ.get("GEMINI_MODEL", "gemini-3.7-flash"))
    anthropic_api_key: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(
        default_factory=lambda: os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    )
    # Groq: free tier, no credit card, OpenAI-compatible. Added after Gemini's
    # free tier proved too tight for a daily run — gemini-3.7-flash allows only
    # 20 requests/day and one edition needs roughly 15-20.
    groq_api_key: str = field(default_factory=lambda: os.environ.get("GROQ_API_KEY", ""))
    groq_model: str = field(
        default_factory=lambda: os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    )

    # --- Selection --------------------------------------------------------
    # Widened from the brief's original 3 days on the owner's instruction. Note
    # this mostly helps slow outlets: because processed_articles excludes
    # anything already seen, a long window pays off once at cold start and then
    # settles back to each outlet's real publishing rate.
    lookback_days: int = field(default_factory=lambda: _int("LOOKBACK_DAYS", 30))
    max_per_country: int = field(default_factory=lambda: _int("MAX_PER_COUNTRY", 3))
    # Titles scoring at or above this on token_set_ratio are treated as the same
    # story. 88 was chosen empirically: high enough that two different stories
    # about the same church do not merge, low enough to catch rewritten headlines.
    duplicate_threshold: int = field(default_factory=lambda: _int("DUPLICATE_THRESHOLD", 88))

    # --- Email ------------------------------------------------------------
    email_provider: str = field(default_factory=lambda: os.environ.get("EMAIL_PROVIDER", "console").lower())
    brevo_api_key: str = field(default_factory=lambda: os.environ.get("BREVO_API_KEY", ""))
    resend_api_key: str = field(default_factory=lambda: os.environ.get("RESEND_API_KEY", ""))
    from_name: str = field(default_factory=lambda: os.environ.get("EMAIL_FROM_NAME", "The 7000"))
    from_address: str = field(
        default_factory=lambda: os.environ.get("EMAIL_FROM_ADDRESS", "the7000testimonies@gmail.com")
    )
    reply_to: str = field(
        default_factory=lambda: os.environ.get("EMAIL_REPLY_TO", "the7000testimonies@gmail.com")
    )
    site_url: str = field(
        default_factory=lambda: os.environ.get("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
    )
    contact_email: str = field(
        default_factory=lambda: os.environ.get("NEXT_PUBLIC_CONTACT_EMAIL", "the7000testimonies@gmail.com")
    )

    # --- Safety rails -----------------------------------------------------
    # Defaults to ON. Someone running this for the first time should not be able
    # to mail a real list by accident; turning it off is a deliberate act.
    dry_run_send: bool = field(default_factory=lambda: _bool("DRY_RUN_SEND", True))
    test_recipient: str = field(
        default_factory=lambda: os.environ.get("EMAIL_TEST_RECIPIENT", "the7000testimonies@gmail.com")
    )
    request_timeout: int = field(default_factory=lambda: _int("REQUEST_TIMEOUT", 25))

    @property
    def user_agent(self) -> str:
        return USER_AGENT.format(contact=self.contact_email)

    def today(self) -> "datetime.date":
        """The edition date: today's calendar date in Singapore."""
        return datetime.now(SGT).date()

    def lookback_cutoff(self) -> datetime:
        """Oldest article publication time still eligible, as an aware UTC datetime."""
        return datetime.now(timezone.utc) - timedelta(days=self.lookback_days)

    def validate(self) -> list[str]:
        """Return a list of problems. Empty list means good to run."""
        problems: list[str] = []
        if not self.supabase_url or not self.supabase_key:
            problems.append(
                "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set."
            )
        if self.llm_provider == "gemini" and not self.gemini_api_key:
            problems.append("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set.")
        if self.llm_provider == "anthropic" and not self.anthropic_api_key:
            problems.append("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.")
        if self.llm_provider == "groq" and not self.groq_api_key:
            problems.append("LLM_PROVIDER=groq but GROQ_API_KEY is not set.")
        if self.llm_provider not in {"gemini", "anthropic", "groq"}:
            problems.append(
                f"Unknown LLM_PROVIDER {self.llm_provider!r}; use gemini, groq or anthropic."
            )
        if not self.dry_run_send and self.email_provider == "console":
            problems.append(
                "DRY_RUN_SEND is off but EMAIL_PROVIDER=console, so nothing would actually send."
            )
        return problems


config = Config()
