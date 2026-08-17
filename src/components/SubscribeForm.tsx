'use client';

import { useState } from 'react';

type State = { kind: 'idle' | 'sending' } | { kind: 'ok' | 'error'; message: string };

export default function SubscribeForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
        return;
      }
      setState({ kind: 'ok', message: data.message });
      setEmail('');
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Please try again.' });
    }
  }

  if (state.kind === 'ok') {
    return (
      <div className={`rounded-md border border-green-300 bg-green-50 p-5 ${compact ? '' : 'sm:p-6'}`}>
        <p className="font-serif text-lg text-green-800">Check your inbox.</p>
        <p className="mt-1 font-sans text-sm text-ink-soft">{state.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === 'sending'}
          className="min-w-0 flex-1 rounded-md border border-rule bg-white px-4 py-3 font-sans text-base text-ink placeholder:text-ink-faint focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state.kind === 'sending'}
          className="rounded-md bg-green-700 px-6 py-3 font-sans text-base font-semibold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:opacity-60"
        >
          {state.kind === 'sending' ? 'Sending…' : 'Subscribe'}
        </button>
      </div>

      {state.kind === 'error' && (
        <p role="alert" className="mt-3 font-sans text-sm text-red-700">{state.message}</p>
      )}

      <p className="mt-3 font-sans text-xs leading-relaxed text-ink-faint">
        One email a day, at 7am Singapore time. We store your address and the date you
        subscribed — nothing else. Unsubscribe from any email.
      </p>
    </form>
  );
}
