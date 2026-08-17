/**
 * Email provider abstraction.
 *
 * The brief asks that switching sending providers later be a config change
 * rather than a rebuild. Everything that sends mail goes through `sendEmail`,
 * and the only thing that decides which service handles it is EMAIL_PROVIDER.
 *
 * Why Brevo is the default and not Resend, despite the brief naming Resend:
 * Resend's shared `resend.dev` sending domain only delivers to the address that
 * owns the account, so it cannot send to a subscriber list until a custom domain
 * is verified. Brevo's free tier allows verifying a single individual address as
 * a sender, which is what makes a real list possible before a domain exists.
 * Both adapters are implemented; flip EMAIL_PROVIDER=resend once a domain is
 * verified and nothing else changes.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Always send one — it materially helps deliverability. */
  text: string;
  /** Per-recipient unsubscribe URL, wired into List-Unsubscribe headers. */
  unsubscribeUrl?: string;
}

export interface SendResult {
  ok: boolean;
  provider: string;
  id?: string;
  error?: string;
}

function fromName() { return process.env.EMAIL_FROM_NAME ?? 'The 7000'; }
function fromAddress() {
  const a = process.env.EMAIL_FROM_ADDRESS;
  if (!a) throw new Error('EMAIL_FROM_ADDRESS is not set.');
  return a;
}
function replyTo() { return process.env.EMAIL_REPLY_TO ?? fromAddress(); }

// ---------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------
async function sendViaBrevo(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, provider: 'brevo', error: 'BREVO_API_KEY is not set.' };

  const recipients = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((email) => ({ email }));

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: fromName(), email: fromAddress() },
      replyTo: { email: replyTo() },
      to: recipients,
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      // One-click unsubscribe. Gmail and Yahoo require this for bulk senders,
      // and it is the difference between the inbox and the spam folder.
      ...(msg.unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, provider: 'brevo', error: `${res.status} ${await res.text()}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, provider: 'brevo', id: data.messageId };
}

// ---------------------------------------------------------------------------
// Resend — ready for the day a custom domain is verified.
// ---------------------------------------------------------------------------
async function sendViaResend(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: 'resend', error: 'RESEND_API_KEY is not set.' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName()} <${fromAddress()}>`,
      reply_to: replyTo(),
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.unsubscribeUrl
        ? { headers: { 'List-Unsubscribe': `<${msg.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
        : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, provider: 'resend', error: `${res.status} ${await res.text()}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, provider: 'resend', id: data.id };
}

// ---------------------------------------------------------------------------
// Console — the local development fallback.
//
// Not a silent no-op: it prints where the mail would have gone so a developer
// without API keys can still exercise the whole subscribe flow.
// ---------------------------------------------------------------------------
async function sendViaConsole(msg: EmailMessage): Promise<SendResult> {
  console.log('\n─── EMAIL (console provider — nothing was actually sent) ───');
  console.log('To:      ', msg.to);
  console.log('Subject: ', msg.subject);
  if (msg.unsubscribeUrl) console.log('Unsub:   ', msg.unsubscribeUrl);
  console.log('Text:\n' + msg.text.slice(0, 600));
  console.log('───────────────────────────────────────────────────────────\n');
  return { ok: true, provider: 'console', id: 'console' };
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const provider = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase();
  try {
    switch (provider) {
      case 'brevo':  return await sendViaBrevo(msg);
      case 'resend': return await sendViaResend(msg);
      case 'console': return await sendViaConsole(msg);
      default:
        return { ok: false, provider, error: `Unknown EMAIL_PROVIDER "${provider}". Use brevo, resend or console.` };
    }
  } catch (err) {
    return { ok: false, provider, error: err instanceof Error ? err.message : String(err) };
  }
}
