import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Two clients, deliberately kept apart.
 *
 * `publicClient` uses the anon key and is subject to RLS. Everything the site
 * renders for visitors goes through it, so a policy mistake shows up as missing
 * data in development rather than as a leak in production.
 *
 * `serviceClient` uses the service-role key and bypasses RLS entirely. It is
 * only ever constructed on the server, and the guard below throws if it is
 * reached from a bundle that could ship to the browser.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertConfigured(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — ` +
      `see the README's "Getting the services running" section.`
    );
  }
  return value;
}

export function publicClient(): SupabaseClient {
  return createClient(
    assertConfigured(url, 'NEXT_PUBLIC_SUPABASE_URL'),
    assertConfigured(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } }
  );
}

export function serviceClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('serviceClient() must never be called in the browser.');
  }
  return createClient(
    assertConfigured(url, 'NEXT_PUBLIC_SUPABASE_URL'),
    assertConfigured(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// ---------------------------------------------------------------------------
// Row types. Hand-written rather than generated: the schema is small, and
// `supabase gen types` would add a codegen step to the deploy for little gain.
// If the schema grows past this file staying readable, switch to codegen.
// ---------------------------------------------------------------------------

export type SourcePerspective = 'local' | 'regional' | 'external';

export interface EvidenceLink { label: string; url: string; }

export interface Source {
  id: string;
  name: string;
  slug: string;
  homepage_url: string;
  country_code: string | null;
  is_regional: boolean;
  denomination: string;
  update_cadence: string;
  primary_language: string;
  needs_translation: boolean;
  status: 'approved' | 'rejected' | 'suspended';
  credibility_score: number;
  source_perspective: SourcePerspective;
  evidence_urls: EvidenceLink[];
  notes: string | null;
}

export interface Country { code: string; name: string; }

export interface Testimony {
  id: string;
  edition_id: string;
  country_code: string;
  source_id: string;
  title: string;
  original_url: string;
  article_published_at: string | null;
  summary: string;
  rank: number;
  was_translated: boolean;
  original_language: string;
  merged_source_ids: string[];
}

export interface CountrySummary {
  country_code: string;
  summary: string;
}

export interface Edition {
  id: string;
  edition_date: string;
  status: 'building' | 'published' | 'no_send';
  consolidation_summary: string | null;
}

/** An edition with everything needed to render it, on the site or in an email. */
export interface FullEdition extends Edition {
  countrySummaries: CountrySummary[];
  testimonies: Testimony[];
}
