import Link from 'next/link';

export const metadata = { title: 'Unsubscribed' };

const MESSAGES: Record<string, { heading: string; body: string }> = {
  ok: {
    heading: 'You have been removed.',
    body: 'No further emails will be sent to this address. The archive stays open to everyone, no subscription needed.',
  },
  invalid: {
    heading: 'We could not find that subscription.',
    body: 'The link may be malformed. If you are still receiving emails, reply to any of them and we will remove you by hand.',
  },
  error: {
    heading: 'Something went wrong.',
    body: 'We could not process that just now. Please try the link again, or reply to any email and we will remove you manually.',
  },
};

export default async function Unsubscribed({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = 'ok' } = await searchParams;
  const m = MESSAGES[status] ?? MESSAGES.error;
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'the7000testimonies@gmail.com';

  return (
    <section className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">{m.heading}</h1>
      <p className="mt-4 font-serif text-lg leading-relaxed text-ink-soft">{m.body}</p>

      {status === 'ok' && (
        <p className="mt-6 font-sans text-sm text-ink-faint">
          If you would also like your email address deleted from our records entirely, write to{' '}
          <a href={`mailto:${contact}?subject=Delete%20my%20data`} className="text-green-700 underline">
            {contact}
          </a>{' '}
          and we will remove it.
        </p>
      )}

      <div className="mt-10 flex justify-center gap-4 font-sans text-sm">
        <Link href="/archive" className="rounded-md border border-rule px-5 py-2.5 text-ink-soft hover:border-green-600 hover:text-green-700">
          Read the archive
        </Link>
        <Link href="/" className="rounded-md border border-rule px-5 py-2.5 text-ink-soft hover:border-green-600 hover:text-green-700">
          Back home
        </Link>
      </div>
    </section>
  );
}
