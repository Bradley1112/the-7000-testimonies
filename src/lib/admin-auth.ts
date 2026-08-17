import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Admin authentication: Supabase magic link, restricted to an allowlist.
 *
 * Two gates, deliberately. Supabase proves the visitor controls the mailbox;
 * the allowlist decides whether that mailbox is allowed in. Without the second
 * gate, anyone who could sign up to the Supabase project would reach /admin —
 * authentication is not authorisation.
 */

export function allowedEmails(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  // An empty allowlist denies everyone. Failing closed matters more here than
  // convenience: a missing env var must never mean "let everybody in".
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

/** Supabase client bound to the request's cookies, for reading the session. */
export async function authClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in the route handler instead.
          }
        },
      },
    }
  );
}

export interface AdminSession { email: string; }

/** Returns the session only if the signed-in address is on the allowlist. */
export async function requireAdmin(): Promise<AdminSession | null> {
  try {
    const supabase = await authClient();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? null;
    return isAllowed(email) ? { email: email! } : null;
  } catch {
    return null;
  }
}
