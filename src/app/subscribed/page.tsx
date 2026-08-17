import Link from 'next/link';

export const metadata = { title: 'Subscription confirmed' };

const MESSAGES: Record<string, { heading: string; body: string }> = {
  ok: {
    heading: 'You&rsquo;re in.',
    body: 'The next edition arrives at 7am Singapore time. If nothing qualified that day, we simply don&rsquo;t send — you will never get a padded email.',
  },
  already: {
    heading: 'Already confirmed.',
    body: 'This address is on the list. Nothing more to do.',
  },
  invalid: {
    heading: 'That link has expired.',
    body: 'Confirmation links can only be used once. Subscribe again and we will send a fresh one.',
  },
  error: {
    heading: 'Something went wrong.',
    body: 'We could not confirm your address just now. Please try subscribing again in a few minutes.',
  },
};

export default async function Subscribed({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = 'ok' } = await searchParams;
  const m = MESSAGES[status] ?? MESSAGES.error;

  return (
    <section className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="font-pixel text-[0.55rem] uppercase tracking-[0.2em] text-green-600">
        The 7000
      </p>
      <h1
        className="mt-5 font-serif text-4xl font-bold tracking-tight text-ink"
        dangerouslySetInnerHTML={{ __html: m.heading }}
      />
      <p
        className="mt-4 font-serif text-lg leading-relaxed text-ink-soft"
        dangerouslySetInnerHTML={{ __html: m.body }}
      />
      <div className="mt-10 flex justify-center gap-4 font-sans text-sm">
        <Link href="/archive" className="rounded-md bg-green-700 px-5 py-2.5 font-semibold text-white hover:bg-green-800">
          Read the archive
        </Link>
        <Link href="/" className="rounded-md border border-rule px-5 py-2.5 text-ink-soft hover:border-green-600 hover:text-green-700">
          Back home
        </Link>
      </div>
    </section>
  );
}
