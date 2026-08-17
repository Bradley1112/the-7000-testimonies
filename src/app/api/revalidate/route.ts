import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * On-demand cache invalidation, called by the daily engine after it publishes.
 *
 * Why this exists: the archive pages use ISR with an hourly revalidate window.
 * Without this endpoint, the engine can finish at 07:00, send an email whose
 * footer links to the archive, and have readers land on a page still showing
 * the previous day — or, on the very first edition, "Nothing here yet". The
 * email and the site would disagree for up to an hour, every single day.
 *
 * Authentication is a shared secret rather than a session: the caller is a
 * scheduled Python job, not a person. Without REVALIDATE_SECRET set, the
 * endpoint refuses everything rather than defaulting open — an unauthenticated
 * cache-buster is a cheap way for anyone to force repeated rebuilds.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    console.error('[revalidate] REVALIDATE_SECRET is not set — refusing.');
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const provided = url.searchParams.get('secret') ?? request.headers.get('x-revalidate-secret');

  if (provided !== secret) {
    // Deliberately vague; do not confirm whether the endpoint is configured.
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const date = url.searchParams.get('date');
  const revalidated: string[] = [];

  // The homepage shows the latest edition date, so it goes stale too.
  for (const path of ['/', '/archive']) {
    revalidatePath(path);
    revalidated.push(path);
  }

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    revalidatePath(`/archive/${date}`);
    revalidated.push(`/archive/${date}`);
  }

  return NextResponse.json({ ok: true, revalidated });
}
