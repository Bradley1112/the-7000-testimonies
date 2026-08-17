import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

/** Reader-nominated outlets, queued for the next vetting round. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  const outletName = str(body.outletName, 200);
  const outletUrl = str(body.outletUrl, 500);
  const countryCode = str(body.countryCode, 2)?.toUpperCase() ?? null;
  const submitterEmail = str(body.submitterEmail, 254);
  const note = str(body.note, 2000);

  if (!outletName || !outletUrl) {
    return NextResponse.json({ error: 'Please give the outlet a name and a link.' }, { status: 400 });
  }
  if (!/^https?:\/\/.+\..+/.test(outletUrl)) {
    return NextResponse.json({ error: 'That does not look like a web address.' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = serviceClient();
  } catch {
    return NextResponse.json({ error: 'Not available right now. Please try later.' }, { status: 503 });
  }

  const { error } = await supabase.from('source_suggestions').insert({
    outlet_name: outletName,
    outlet_url: outletUrl,
    country_code: countryCode || null,
    submitter_email: submitterEmail,
    note,
  });

  if (error) {
    console.error('[suggest-source] insert failed:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Thank you — we will look into it and vet it properly.',
  });
}
