import Link from 'next/link';
import { listEditions, formatEditionDate } from '@/lib/editions';

export const metadata = {
  title: 'Archive',
  description:
    'Every edition of The 7000 — daily testimonies of God at work across Southeast Asia, browsable by date. Free to read, no subscription needed.',
};

export const revalidate = 3600;

export default async function ArchiveIndex() {
  const editions = await listEditions();

  const byMonth = new Map<string, typeof editions>();
  for (const e of editions) {
    const key = e.edition_date.slice(0, 7); // YYYY-MM
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">Archive</h1>
      <p className="mt-4 max-w-[var(--container-measure)] font-serif text-lg leading-relaxed text-ink-soft">
        Every edition we have sent. Free to read, no subscription needed — if any of this is
        worth passing on to someone who needs it, please do.
      </p>

      {editions.length === 0 ? (
        <div className="mt-12 rounded-md border border-rule bg-paper-alt p-6">
          <p className="font-serif text-lg text-ink">Nothing here yet.</p>
          <p className="mt-2 font-sans text-sm text-ink-soft">
            The first edition will appear the morning after the daily job runs.{' '}
            <Link href="/" className="text-green-700 underline underline-offset-4">
              Subscribe
            </Link>{' '}
            and you will not have to check back.
          </p>
        </div>
      ) : (
        <div className="mt-12 space-y-12">
          {[...byMonth.entries()].map(([month, list]) => (
            <section key={month}>
              <h2 className="font-sans text-xs uppercase tracking-widest text-ink-faint">
                {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
                  month: 'long', year: 'numeric', timeZone: 'UTC',
                })}
              </h2>
              <ul className="mt-4 space-y-6">
                {list.map((e) => (
                  <li key={e.id} className="border-t border-rule pt-5">
                    <Link href={`/archive/${e.edition_date}`} className="group block">
                      <p className="font-sans text-sm text-green-700 group-hover:underline underline-offset-4">
                        {formatEditionDate(e.edition_date)}
                      </p>
                      {e.consolidation_summary && (
                        <p className="mt-2 line-clamp-3 font-serif text-base leading-relaxed text-ink-soft">
                          {e.consolidation_summary}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
