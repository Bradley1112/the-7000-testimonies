import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

/**
 * Double opt-in confirmation. Reached from the link in the confirmation email,
 * so it must be a GET and must redirect to a human-readable page rather than
 * returning JSON to someone's browser.
 */
export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const token = new URL(request.url).searchParams.get('token');

  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/subscribed?status=${reason}`, { status: 303 });

  if (!token) return fail('invalid');

  let supabase;
  try { supabase = serviceClient(); } catch { return fail('error'); }

  const { data: subscriber, error } = await supabase
    .from('subscribers')
    .select('id, status')
    .eq('confirm_token', token)
    .maybeSingle();

  if (error) {
    console.error('[confirm] lookup failed:', error);
    return fail('error');
  }

  // No match means either a bad token or one already spent. Both look the same
  // to the visitor, which is what we want — but a confirmed subscriber clicking
  // their old link twice should not be told anything alarming.
  if (!subscriber) return fail('invalid');
  if (subscriber.status === 'confirmed') return fail('already');

  const { error: updateError } = await supabase
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirm_token: null, // single use
    })
    .eq('id', subscriber.id);

  if (updateError) {
    console.error('[confirm] update failed:', updateError);
    return fail('error');
  }

  return NextResponse.redirect(`${siteUrl}/subscribed?status=ok`, { status: 303 });
}
