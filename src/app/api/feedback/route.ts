import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

/**
 * Store a thumbs rating and/or comment against a testimony.
 * Collected for manual review only — nothing downstream acts on it.
 */
export async function POST(request: Request) {
  let body: { testimonyId?: string; rating?: string; comment?: string; visitorKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const testimonyId = typeof body.testimonyId === 'string' ? body.testimonyId : null;
  const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null;
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : null;
  const visitorKey = typeof body.visitorKey === 'string' ? body.visitorKey.slice(0, 64) : null;

  if (!testimonyId) return NextResponse.json({ error: 'Missing testimony.' }, { status: 400 });
  // Matches the feedback_has_content constraint; fail here with a clear message
  // rather than letting Postgres reject it.
  if (!rating && !comment) {
    return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  }

  let supabase;
  try { supabase = serviceClient(); } catch { return NextResponse.json({ ok: true }); }

  const { error } = await supabase.from('feedback').insert({
    testimony_id: testimonyId,
    rating,
    comment: comment || null,
    visitor_key: visitorKey,
  });

  if (error) {
    console.error('[feedback] insert failed:', error);
    // Deliberately still 200: a reader clicking a thumb should never be shown an
    // error for something that does not affect them.
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
