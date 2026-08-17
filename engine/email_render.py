"""
The daily digest email.

Table-based, inline-styled HTML — Outlook renders through Word and ignores
almost everything modern. Palette and voice match the website so the brand is
continuous between site and inbox.

Kept in sync with src/lib/email/templates.ts by sharing nothing but discipline;
the confirmation email lives there because Next sends it, the digest lives here
because Python sends it. If they drift, the tokens block below is the thing to
reconcile.
"""

from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import date

from config import config

GREEN = "#454B1B"
GREEN_PALE = "#F4F6EC"
GREEN_100 = "#E4E7D5"
PAPER = "#FDFDFB"
INK = "#1C1D17"
INK_SOFT = "#4A4C42"
INK_FAINT = "#7C7E72"
RULE = "#E2E3D9"

SERIF = "Georgia, 'Times New Roman', Times, serif"
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"


@dataclass
class EmailTestimony:
    title: str
    summary: str
    url: str
    source_name: str
    also_from: list[str]
    translated_from: str | None


@dataclass
class EmailCountry:
    name: str
    summary: str | None
    testimonies: list[EmailTestimony]


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def render_digest(
    edition_date: date,
    countries: list[EmailCountry],
    consolidation: str | None,
    unsubscribe_url: str,
) -> tuple[str, str, str]:
    """Returns (subject, html, text)."""
    site = config.site_url
    date_label = edition_date.strftime("%A, %-d %B %Y")

    # Subject line names the countries actually present. Never promise breadth
    # the edition does not have — a Singapore-only day should say so.
    names = [c.name for c in countries]
    if len(names) == 1:
        where = names[0]
    elif len(names) == 2:
        where = f"{names[0]} and {names[1]}"
    else:
        where = f"{names[0]}, {names[1]} and {len(names) - 2} more"
    total = sum(len(c.testimonies) for c in countries)
    subject = f"The 7000 — {total} testimon{'y' if total == 1 else 'ies'} from {where}"

    blocks: list[str] = [f"""
<tr><td style="padding:0;">
  <a href="{site}" style="text-decoration:none;display:block;">
    <img src="{site}/email/banner-scene4.png" width="600"
         alt="Elijah at the cave entrance beneath a starry sky, with the silhouettes of seven thousand faithful behind him"
         style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
  </a>
</td></tr>
<tr><td style="padding:24px 24px 0 24px;font-family:{SERIF};">
  <h1 style="margin:0;font-size:26px;line-height:1.2;color:{GREEN};">The 7000</h1>
  <p style="margin:6px 0 0 0;font-family:{SANS};font-size:13px;color:{INK_FAINT};">{_esc(date_label)}</p>
</td></tr>"""]

    for country in countries:
        blocks.append(f"""
<tr><td style="padding:30px 24px 0 24px;font-family:{SERIF};">
  <h2 style="margin:0;font-size:21px;color:{GREEN};border-bottom:2px solid {GREEN_100};padding-bottom:6px;">
    {_esc(country.name)}
  </h2>
  {f'<p style="margin:12px 0 0 0;font-size:16px;line-height:1.6;font-style:italic;color:{INK_SOFT};">{_esc(country.summary)}</p>' if country.summary else ''}
</td></tr>""")

        for t in country.testimonies:
            credit = _esc(t.source_name)
            if t.also_from:
                credit += " and " + _esc(", ".join(t.also_from))
            translated = (
                f'<span style="color:{GREEN};"> · translated from {_esc(t.translated_from)}</span>'
                if t.translated_from else ""
            )
            blocks.append(f"""
<tr><td style="padding:22px 24px 0 24px;font-family:{SERIF};">
  <h3 style="margin:0;font-size:18px;line-height:1.35;color:{INK};">{_esc(t.title)}</h3>
  <p style="margin:4px 0 0 0;font-family:{SANS};font-size:12px;color:{INK_FAINT};">{credit}{translated}</p>
  <p style="margin:10px 0 0 0;font-size:16px;line-height:1.65;color:{INK_SOFT};">{_esc(t.summary)}</p>
  <p style="margin:12px 0 0 0;font-family:{SANS};font-size:14px;">
    <a href="{_esc(t.url)}" style="color:{GREEN};font-weight:bold;text-decoration:underline;">
      Read the full story at {_esc(t.source_name)} &rarr;
    </a>
  </p>
</td></tr>""")

    if consolidation:
        blocks.append(f"""
<tr><td style="padding:34px 24px 8px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:{GREEN_PALE};border:1px solid {GREEN_100};">
    <tr><td style="padding:20px;font-family:{SERIF};">
      <p style="margin:0 0 8px 0;font-family:{SANS};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:{GREEN};">
        Across the region
      </p>
      <p style="margin:0;font-size:16px;line-height:1.65;color:{INK};">{_esc(consolidation)}</p>
    </td></tr>
  </table>
</td></tr>""")

    blocks.append(f"""
<tr><td style="padding:26px 24px 30px 24px;font-family:{SERIF};border-top:1px solid {RULE};">
  <p style="margin:0;font-size:15px;font-style:italic;color:{INK_SOFT};">
    &ldquo;Yet I reserve seven thousand in Israel&mdash;all whose knees have not bowed to Baal.&rdquo;
  </p>
  <p style="margin:6px 0 0 0;font-family:{SANS};font-size:12px;color:{INK_FAINT};">1 Kings 19:18</p>
  <p style="margin:18px 0 0 0;font-family:{SANS};font-size:13px;color:{INK_FAINT};">
    Replying to this email reaches a person. We read everything.
  </p>
</td></tr>""")

    body = "".join(blocks)

    html_doc = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>{_esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:{GREEN_PALE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;">{_esc(_preheader(countries))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{GREEN_PALE};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background-color:{PAPER};border:1px solid {RULE};">
    {body}
  </table>
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="padding:18px 24px;text-align:center;font-family:{SANS};font-size:12px;line-height:1.6;color:{INK_FAINT};">
      <p style="margin:0 0 6px 0;">We summarise and link to original reporting. We never republish full articles.</p>
      <p style="margin:0;">
        <a href="{unsubscribe_url}" style="color:{INK_FAINT};">Unsubscribe</a> &middot;
        <a href="{site}/archive" style="color:{INK_FAINT};">Archive</a> &middot;
        <a href="{site}/sources" style="color:{INK_FAINT};">Sources</a>
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    return subject, html_doc, _plain_text(date_label, countries, consolidation, unsubscribe_url)


def _preheader(countries: list[EmailCountry]) -> str:
    for c in countries:
        if c.testimonies:
            return c.testimonies[0].title[:140]
    return "Today's testimonies from across Southeast Asia."


def _plain_text(date_label: str, countries: list[EmailCountry],
                consolidation: str | None, unsubscribe_url: str) -> str:
    lines = [f"THE 7000 — {date_label}", "=" * 52, ""]
    for c in countries:
        lines += [c.name.upper(), "-" * len(c.name)]
        if c.summary:
            lines += [c.summary, ""]
        for t in c.testimonies:
            credit = t.source_name + (" and " + ", ".join(t.also_from) if t.also_from else "")
            lines += [t.title, f"({credit})", "", t.summary, f"Read it: {t.url}", ""]
        lines.append("")
    if consolidation:
        lines += ["ACROSS THE REGION", "-" * 17, consolidation, ""]
    lines += [
        '"Yet I reserve seven thousand in Israel—all whose knees have not bowed to Baal." — 1 Kings 19:18',
        "",
        "Replying to this email reaches a person. We read everything.",
        f"Unsubscribe: {unsubscribe_url}",
    ]
    return "\n".join(lines)
