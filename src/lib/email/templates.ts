/**
 * HTML email templates.
 *
 * Written to 2003 HTML rules on purpose: tables for layout, inline styles only,
 * no flexbox, no grid, no external stylesheets, no web fonts. Outlook renders
 * through Microsoft Word's engine and ignores nearly everything modern.
 *
 * The palette and voice match the website so the brand is continuous between
 * site and inbox, which is what the brief asks for.
 */

const GREEN = '#454B1B';
const GREEN_DARK = '#343A14';
const GREEN_PALE = '#F4F6EC';
const PAPER = '#FDFDFB';
const INK = '#1C1D17';
const INK_SOFT = '#4A4C42';
const INK_FAINT = '#7C7E72';
const RULE = '#E2E3D9';

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

/**
 * Shared shell. `preheader` is the grey line inbox clients show next to the
 * subject; leaving it out lets the client scrape whatever text comes first,
 * which is usually "View in browser" and looks careless.
 */
export function emailShell({
  title, preheader, body, unsubscribeUrl,
}: { title: string; preheader: string; body: string; unsubscribeUrl?: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${GREEN_PALE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${GREEN_PALE};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${PAPER};border:1px solid ${RULE};">
        ${body}
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:20px 24px;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_FAINT};text-align:center;">
          <p style="margin:0 0 8px 0;">
            The 7000 &mdash; daily testimonies from across Southeast Asia.
          </p>
          <p style="margin:0 0 8px 0;">
            We summarise and link to original reporting. We never republish full articles.
          </p>
          ${unsubscribeUrl ? `<p style="margin:0;">
            <a href="${unsubscribeUrl}" style="color:${INK_FAINT};text-decoration:underline;">Unsubscribe</a>
            &nbsp;&middot;&nbsp;
            <a href="${siteUrl()}/archive" style="color:${INK_FAINT};text-decoration:underline;">Read the archive</a>
          </p>` : ''}
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Header for the confirmation email: a solid green band carrying the verse
 * the newsletter is named for, rather than the pixel-art Scene 4 banner used
 * in the daily digest. A first-touch email whose only job is one click reads
 * better anchored on the verse itself; the full pixel-art story is what
 * subscribers discover once they land on the site.
 *
 * No CSS opacity here — Outlook's Word rendering engine handles it
 * unreliably, so the muted label uses a fixed pale tint instead.
 */
export function masthead({ dateLabel }: { dateLabel?: string } = {}): string {
  return `
<tr><td style="background-color:${GREEN};padding:30px 24px;text-align:center;">
  <p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GREEN_PALE};">
    1 Kings 19:18 (NIV)
  </p>
  <p style="margin:10px 0 0 0;font-family:${SERIF};font-size:17px;font-style:italic;line-height:1.55;color:#FFFFFF;">
    &ldquo;Yet I reserve seven thousand in Israel&mdash;all whose knees have not bowed down to Baal
    and whose mouths have not kissed him.&rdquo;
  </p>
</td></tr>
<tr><td style="padding:22px 24px 0 24px;font-family:${SERIF};">
  <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:bold;color:${GREEN};letter-spacing:-0.01em;">The 7000</h1>
  ${dateLabel ? `<p style="margin:6px 0 0 0;font-family:${SANS};font-size:13px;color:${INK_FAINT};">${escapeHtml(dateLabel)}</p>` : ''}
</td></tr>`;
}

// ---------------------------------------------------------------------------
// Double opt-in confirmation
// ---------------------------------------------------------------------------
export function confirmationEmail({ confirmUrl }: { confirmUrl: string }) {
  const body = `
${masthead()}
<tr><td style="padding:18px 24px 28px 24px;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK_SOFT};">
  <p style="margin:0 0 16px 0;">
    Thank you for subscribing. One tap confirms your address, and the first edition
    will arrive at 7am Singapore time.
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td style="background-color:${GREEN};">
      <a href="${confirmUrl}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
        Confirm my subscription
      </a>
    </td></tr>
  </table>

  <p style="margin:0 0 16px 0;font-family:${SANS};font-size:13px;color:${INK_FAINT};">
    If the button does not work, paste this into your browser:<br />
    <a href="${confirmUrl}" style="color:${GREEN};word-break:break-all;">${confirmUrl}</a>
  </p>

  <hr style="border:0;border-top:1px solid ${RULE};margin:24px 0;" />

  <p style="margin:0;font-family:${SANS};font-size:13px;color:${INK_FAINT};">
    If you did not sign up, ignore this email and nothing further will be sent.
  </p>
</td></tr>`;

  return {
    subject: 'Confirm your subscription to The 7000',
    html: emailShell({
      title: 'Confirm your subscription to The 7000',
      preheader: 'One tap to confirm, and the first edition arrives at 7am Singapore time.',
      body,
    }),
    text:
      `The 7000\n\n` +
      `1 Kings 19:18 (NIV) — "Yet I reserve seven thousand in Israel—all whose knees have not ` +
      `bowed down to Baal and whose mouths have not kissed him."\n\n` +
      `Thank you for subscribing. Confirm your address to start receiving the daily email:\n\n` +
      `${confirmUrl}\n\n` +
      `If you did not sign up, ignore this email and nothing further will be sent.\n`,
  };
}

/** Minimal HTML escaping for values interpolated into templates. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const emailTokens = { GREEN, GREEN_DARK, GREEN_PALE, PAPER, INK, INK_SOFT, INK_FAINT, RULE, SERIF, SANS, siteUrl };
