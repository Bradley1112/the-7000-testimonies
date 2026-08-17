import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isAllowed } from '@/lib/admin-auth';

/**
 * Magic-link landing point. Exchanges the one-time code for a session cookie,
 * then checks the allowlist before letting anyone through to /admin.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (!code) return NextResponse.redirect(`${origin}/admin/login?error=missing_code`);

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}/admin`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/admin/login?error=invalid_link`);
  }

  // Authenticated but not authorised: sign them straight back out rather than
  // leaving a valid session cookie for an address that may never access /admin.
  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/admin/login?error=not_allowed`);
  }

  return response;
}
