'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-md border border-rule px-4 py-2 font-sans text-sm text-ink-soft hover:border-green-600 hover:text-green-700"
    >
      Sign out
    </button>
  );
}
