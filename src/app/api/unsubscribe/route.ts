import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

/**
 * Unsubscribe.
 *
 * Handles both GET (the visible link in the footer) and POST (RFC 8058
 * one-click, which Gmail and Yahoo now require from bulk senders — their
 * clients POST to the List-Unsubscribe URL without any human involvement).
 *
 * The token is a stable per-subscriber secret rather than a guessable id, so a
 * link that sits in an inbox for a year keeps working without ever exposing
 * anyone else's subscription.
 */

async function unsubscribe(token: string | null): Promise<'ok' | 'invalid' | 'error'> {
  if (!token) return 'invalid';

  let supabase;
  try { supabase = serviceClient(); } catch { return 'error'; }

  const { data, error } = await supabase
    .from('subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('id');

  if (error) {
    console.error('[unsubscribe] failed:', error);
    return 'error';
  }
  // Already-unsubscribed tokens still match and update, so an empty result
  // means the token genuinely does not exist.
  return data && data.length > 0 ? 'ok' : 'invalid';
}

export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const token = new URL(request.url).searchParams.get('token');
  const status = await unsubscribe(token);
  return NextResponse.redirect(`${siteUrl}/unsubscribed?status=${status}`, { status: 303 });
}

export async function POST(request: Request) {
  // One-click clients expect a 200 with no body and will not follow a redirect.
  const token = new URL(request.url).searchParams.get('token');
  const status = await unsubscribe(token);
  return new NextResponse(null, { status: status === 'error' ? 500 : 200 });
}
