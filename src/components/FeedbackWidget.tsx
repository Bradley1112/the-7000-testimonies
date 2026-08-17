'use client';

import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Thumbs up/down plus an optional comment, on each archived testimony.
 *
 * Feedback is collected for the owner to read. Nothing here re-ranks or removes
 * content automatically — that is explicitly out of scope for now.
 *
 * `visitorKey` is a random id in localStorage. It is not an account and not
 * personal data; it exists so one reader clicking twice does not read as two
 * people, and so the UI can remember that you already voted.
 */

const KEY = 'the7000:visitor';

function visitorKey(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(KEY, v); }
    return v;
  } catch {
    return 'anonymous';
  }
}

export default function FeedbackWidget({ testimonyId }: { testimonyId: string }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  // Render nothing until hydrated: the "already voted" state comes from
  // localStorage, which does not exist during server rendering.
  const mounted = useHydrated();

  async function send(next: { rating?: 'up' | 'down'; comment?: string }) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testimonyId, visitorKey: visitorKey(), ...next }),
      });
    } catch {
      // Feedback is best-effort. A failure here must never interrupt reading.
    }
  }

  function vote(v: 'up' | 'down') {
    setRating(v);
    setShowComment(true);
    void send({ rating: v });
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (comment.trim()) await send({ rating: rating ?? undefined, comment: comment.trim() });
    setDone(true);
    setShowComment(false);
  }

  if (!mounted) return null;

  if (done) {
    return <p className="mt-4 font-sans text-xs text-ink-faint">Thank you — that is read by a person.</p>;
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <span className="font-sans text-xs text-ink-faint">Was this encouraging?</span>
        {(['up', 'down'] as const).map((v) => (
          <button
            key={v}
            onClick={() => vote(v)}
            aria-pressed={rating === v}
            aria-label={v === 'up' ? 'Yes, encouraging' : 'No, not encouraging'}
            className={`rounded border px-2 py-1 font-sans text-xs transition ${
              rating === v
                ? 'border-green-600 bg-green-100 text-green-800'
                : 'border-rule text-ink-faint hover:border-green-600 hover:text-green-700'
            }`}
          >
            {v === 'up' ? '👍' : '👎'}
          </button>
        ))}
      </div>

      {showComment && (
        <form onSubmit={submitComment} className="mt-3">
          <label htmlFor={`c-${testimonyId}`} className="sr-only">Optional comment</label>
          <textarea
            id={`c-${testimonyId}`}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            placeholder="Anything you would like to add? (optional)"
            className="w-full rounded-md border border-rule bg-white px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-300"
          />
          <div className="mt-2 flex gap-2">
            <button type="submit" className="rounded bg-green-700 px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-green-800">
              Send
            </button>
            <button type="button" onClick={() => setDone(true)} className="font-sans text-xs text-ink-faint hover:text-ink">
              No thanks
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
