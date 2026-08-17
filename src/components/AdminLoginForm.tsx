'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // No self-service admin accounts. The address must already exist as a
        // Supabase user, created by hand once.
        shouldCreateUser: false,
      },
    });

    if (authError) {
      // Deliberately vague: whether an address is a registered admin is not
      // something an anonymous visitor should be able to probe.
      setError('Could not send a link. Check the address and try again.');
      setState('idle');
      return;
    }
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-5">
        <p className="font-serif text-lg text-green-800">Check your inbox.</p>
        <p className="mt-1 font-sans text-sm text-ink-soft">
          If that address is an admin, a sign-in link is on its way. It expires shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="admin-email" className="block font-sans text-sm font-semibold text-ink">
          Email address
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-rule bg-white px-3 py-2.5 font-sans text-base text-ink focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-300"
        />
      </div>

      {error && <p role="alert" className="font-sans text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full rounded-md bg-green-700 px-5 py-3 font-sans text-base font-semibold text-white hover:bg-green-800 disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
      </button>
    </form>
  );
}
