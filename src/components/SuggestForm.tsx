'use client';

import { useState } from 'react';

const COUNTRIES = [
  ['SG', 'Singapore'], ['MY', 'Malaysia'], ['ID', 'Indonesia'], ['PH', 'Philippines'],
  ['TH', 'Thailand'], ['VN', 'Vietnam'], ['KH', 'Cambodia'], ['LA', 'Laos'],
  ['MM', 'Myanmar'], ['BN', 'Brunei'], ['TL', 'Timor-Leste'],
];

const field =
  'w-full rounded-md border border-rule bg-white px-3 py-2.5 font-sans text-base text-ink ' +
  'placeholder:text-ink-faint focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-300';

export default function SuggestForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('sending');
    setError(null);

    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/suggest-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName: fd.get('outletName'),
          outletUrl: fd.get('outletUrl'),
          countryCode: fd.get('countryCode'),
          submitterEmail: fd.get('submitterEmail'),
          note: fd.get('note'),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setState('idle'); return; }
      setMessage(data.message);
      setState('done');
    } catch {
      setError('Could not reach the server. Please try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-6">
        <p className="font-serif text-lg text-green-800">Got it.</p>
        <p className="mt-1 font-sans text-sm text-ink-soft">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="outletName" className="block font-sans text-sm font-semibold text-ink">
          Outlet name <span className="text-green-700">*</span>
        </label>
        <input id="outletName" name="outletName" required maxLength={200} className={`mt-1.5 ${field}`} />
      </div>

      <div>
        <label htmlFor="outletUrl" className="block font-sans text-sm font-semibold text-ink">
          Website <span className="text-green-700">*</span>
        </label>
        <input
          id="outletUrl" name="outletUrl" type="url" required placeholder="https://"
          className={`mt-1.5 ${field}`}
        />
      </div>

      <div>
        <label htmlFor="countryCode" className="block font-sans text-sm font-semibold text-ink">
          Country
        </label>
        <select id="countryCode" name="countryCode" defaultValue="" className={`mt-1.5 ${field}`}>
          <option value="">Not sure / regional</option>
          {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="note" className="block font-sans text-sm font-semibold text-ink">
          Anything we should know?
        </label>
        <textarea
          id="note" name="note" rows={4} maxLength={2000}
          placeholder="How often they publish, whether they run testimonies, who is behind them…"
          className={`mt-1.5 ${field}`}
        />
      </div>

      <div>
        <label htmlFor="submitterEmail" className="block font-sans text-sm font-semibold text-ink">
          Your email <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <input id="submitterEmail" name="submitterEmail" type="email" className={`mt-1.5 ${field}`} />
        <p className="mt-1.5 font-sans text-xs text-ink-faint">
          Only so we can ask a follow-up question. It is not added to the mailing list.
        </p>
      </div>

      {error && <p role="alert" className="font-sans text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-md bg-green-700 px-6 py-3 font-sans text-base font-semibold text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send suggestion'}
      </button>
    </form>
  );
}
