import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email/provider';
import { confirmationEmail } from '@/lib/email/templates';

/**
 * Subscribe — email only, double opt-in.
 *
 * Deliberate behaviour: this endpoint returns the same success message whether
 * the address is new, already pending, or already confirmed. Saying "you are
 * already subscribed" would turn the form into an oracle that reveals whether
 * any given address is on the list.
 */

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Intentionally permissive. Strict RFC-5322 regexes reject valid addresses;
  // the confirmation email is the real validation — an address that cannot
  // receive mail can never confirm.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const SUCCESS = {
    ok: true,
    message: 'We have sent you a confirmation link. Tap it and you are in.',
  };

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    console.error('[subscribe] Supabase not configured:', err);
    return NextResponse.json(
      { error: 'Subscriptions are not available right now. Please try again later.' },
      { status: 503 }
    );
  }

  const { data: existing, error: lookupError } = await supabase
    .from('subscribers')
    .select('id, status, confirm_token, unsubscribe_token')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('[subscribe] lookup failed:', lookupError);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Already confirmed: do nothing, say the same thing. Re-sending a confirmation
  // to a confirmed subscriber is a small but real abuse vector.
  if (existing?.status === 'confirmed') {
    return NextResponse.json(SUCCESS);
  }

  const confirmToken = crypto.randomUUID();

  if (existing) {
    // Pending, unsubscribed or bounced — issue a fresh token and let them back in.
    const { error } = await supabase
      .from('subscribers')
      .update({ status: 'pending', confirm_token: confirmToken, confirm_sent_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) {
      console.error('[subscribe] update failed:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from('subscribers')
      .insert({ email, status: 'pending', confirm_token: confirmToken, confirm_sent_at: new Date().toISOString() });
    if (error) {
      console.error('[subscribe] insert failed:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { subject, html, text } = confirmationEmail({
    confirmUrl: `${siteUrl}/api/confirm?token=${confirmToken}`,
  });

  const result = await sendEmail({ to: email, subject, html, text });
  if (!result.ok) {
    // The row exists and the token is valid, so this is recoverable by
    // re-submitting the form. Log loudly; do not leak provider errors.
    console.error('[subscribe] send failed:', result.error);
    return NextResponse.json(
      { error: 'We could not send the confirmation email. Please try again shortly.' },
      { status: 502 }
    );
  }

  return NextResponse.json(SUCCESS);
}
