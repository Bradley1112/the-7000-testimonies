import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getEdition, formatEditionDate, orderCountries } from '@/lib/editions';
import FeedbackWidget from '@/components/FeedbackWidget';

export const revalidate = 3600;

type Params = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  const edition = await getEdition(date);
  if (!edition) return { title: 'Edition not found' };
  return {
    title: formatEditionDate(edition.edition_date),
    description:
      edition.consolidation_summary?.slice(0, 160) ??
      'Testimonies of God at work across Southeast Asia.',
  };
}

export default async function EditionPage({ params }: Params) {
  const { date } = await params;

  // Guard the route shape before hitting the database: /archive/nonsense should
  // 404 rather than produce a Postgres date-parse error.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const edition = await getEdition(date);
  if (!edition) notFound();

  const countries = orderCountries(edition);
  const summaryFor = new Map(edition.countrySummaries.map((s) => [s.country_code, s.summary]));

  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <header>
        <p className="font-sans text-sm text-ink-faint">{formatEditionDate(edition.edition_date)}</p>
        <h1 className="mt-2 font-serif text-4xl font-bold tracking-tight text-ink">
          The 7000
        </h1>
      </header>

      {countries.map((code) => {
        const testimonies = edition.testimonies.filter((t) => t.country_code === code);
        if (testimonies.length === 0) return null; // never render an empty country

        return (
          <section key={code} className="mt-14">
            <h2 className="font-serif text-2xl font-bold text-green-700">
              {edition.countryNames.get(code) ?? code}
            </h2>

            {summaryFor.get(code) && (
              <p className="mt-2 font-serif text-lg italic leading-relaxed text-ink-soft">
                {summaryFor.get(code)}
              </p>
            )}

            <div className="mt-6 space-y-10">
              {testimonies.map((t) => (
                <div key={t.id} className="border-t border-rule pt-6">
                  <h3 className="font-serif text-xl font-bold leading-snug text-ink">
                    {t.title}
                  </h3>

                  <p className="mt-1 font-sans text-xs text-ink-faint">
                    {edition.sourceNames.get(t.source_id) ?? 'Source'}
                    {t.merged_source_ids?.length > 0 && (
                      <>
                        {' '}and{' '}
                        {t.merged_source_ids
                          .map((id) => edition.sourceNames.get(id) ?? 'another outlet')
                          .join(', ')}
                      </>
                    )}
                    {t.was_translated && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                        translated from {t.original_language}
                      </span>
                    )}
                  </p>

                  <p className="mt-3 font-serif text-lg leading-relaxed text-ink-soft">
                    {t.summary}
                  </p>

                  <p className="mt-4">
                    <a
                      href={t.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-sans text-sm font-semibold text-green-700 underline decoration-green-300 underline-offset-4 hover:decoration-green-700"
                    >
                      Read the full story at {edition.sourceNames.get(t.source_id) ?? 'the source'} ↗
                    </a>
                  </p>

                  <FeedbackWidget testimonyId={t.id} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {edition.consolidation_summary && (
        <section className="mt-16 rounded-lg border border-green-300 bg-green-50 p-6 sm:p-8">
          <h2 className="font-sans text-xs uppercase tracking-widest text-green-700">
            Across the region
          </h2>
          <p className="mt-3 font-serif text-lg leading-relaxed text-ink">
            {edition.consolidation_summary}
          </p>
        </section>
      )}

      <footer className="mt-16 border-t border-rule pt-8">
        <p className="font-serif text-base italic text-ink-soft">
          &ldquo;Yet I reserve seven thousand in Israel&mdash;all whose knees have not bowed to Baal.&rdquo;
        </p>
        <div className="mt-8 flex flex-wrap gap-4 font-sans text-sm">
          <Link href="/archive" className="text-green-700 underline underline-offset-4">
            ← All editions
          </Link>
          <Link href="/" className="text-green-700 underline underline-offset-4">
            Subscribe
          </Link>
        </div>
      </footer>
    </article>
  );
}
