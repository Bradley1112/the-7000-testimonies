"""Sending the digest. Mirrors the provider abstraction in src/lib/email/provider.ts."""

from __future__ import annotations

import logging
import time

import requests

from config import config

log = logging.getLogger(__name__)


def _brevo(to: list[str], subject: str, html: str, text: str, unsub: str) -> tuple[bool, str]:
    # Brevo's `to` accepts up to 99 recipients per call. Each one still gets an
    # individual message; nobody sees anyone else's address.
    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": config.brevo_api_key, "Content-Type": "application/json"},
        json={
            "sender": {"name": config.from_name, "email": config.from_address},
            "replyTo": {"email": config.reply_to},
            "to": [{"email": e} for e in to],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
            "headers": {
                "List-Unsubscribe": f"<{unsub}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        },
        timeout=config.request_timeout,
    )
    return resp.ok, ("" if resp.ok else f"{resp.status_code} {resp.text[:300]}")


def _resend(to: list[str], subject: str, html: str, text: str, unsub: str) -> tuple[bool, str]:
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {config.resend_api_key}", "Content-Type": "application/json"},
        json={
            "from": f"{config.from_name} <{config.from_address}>",
            "reply_to": config.reply_to,
            "to": to,
            "subject": subject,
            "html": html,
            "text": text,
            "headers": {
                "List-Unsubscribe": f"<{unsub}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        },
        timeout=config.request_timeout,
    )
    return resp.ok, ("" if resp.ok else f"{resp.status_code} {resp.text[:300]}")


def send_digest(recipients: list[dict], subject: str, html: str, text: str) -> int:
    """
    Send to every confirmed subscriber. Returns the number successfully sent.

    Sent one at a time rather than as a single bulk call, because the
    unsubscribe link is per-subscriber — a shared List-Unsubscribe URL would let
    one reader unsubscribe someone else. At a few thousand subscribers this is
    still only a few thousand cheap HTTP calls once a day.
    """
    if config.dry_run_send:
        log.warning(
            "DRY_RUN_SEND is on — sending only to %s instead of %d subscribers.",
            config.test_recipient, len(recipients),
        )
        recipients = [{"email": config.test_recipient, "unsubscribe_token": "dry-run"}]

    provider = config.email_provider
    if provider == "console":
        log.info("EMAIL_PROVIDER=console — not sending. Subject: %s", subject)
        log.info("Would have gone to %d recipient(s).", len(recipients))
        return 0

    send = _brevo if provider == "brevo" else _resend if provider == "resend" else None
    if send is None:
        log.error("Unknown EMAIL_PROVIDER %r — nothing sent.", provider)
        return 0

    sent = 0
    for i, sub in enumerate(recipients):
        unsub = f"{config.site_url}/api/unsubscribe?token={sub['unsubscribe_token']}"
        ok, err = False, "not attempted"
        for attempt in range(2):
            try:
                ok, err = send([sub["email"]], subject, html, text, unsub)
            except Exception as exc:  # noqa: BLE001
                ok, err = False, repr(exc)
            if ok:
                break
            time.sleep(1.5)

        if ok:
            sent += 1
        else:
            # Log and keep going. One bad address must not stop the send.
            log.error("send failed for %s: %s", sub["email"], err)

        # Stay well inside free-tier rate limits.
        if i and i % 20 == 0:
            time.sleep(1.0)

    log.info("sent %d/%d", sent, len(recipients))
    return sent
