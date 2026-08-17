import Link from 'next/link';
import PixelStory from '@/components/PixelStory';
import SubscribeForm from '@/components/SubscribeForm';
import { publicClient } from '@/lib/supabase';

// The homepage shows the most recent edition, so it must not be cached
// indefinitely. Revalidate hourly: the engine publishes once a day, and an
// hour of staleness costs nothing while keeping this page mostly static.
export const revalidate = 3600;

async function latestEdition() {
  try {
    const supabase = publicClient();
    const { data } = await supabase
      .from('editions')
      .select('edition_date, consolidation_summary')
      .eq('status', 'published')
      .order('edition_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch {
    // Before Supabase is configured (or if it is briefly unreachable) the
    // homepage must still render — the subscribe form is the thing that matters.
    return null;
  }
}

export default async function Home() {
  const edition = await latestEdition();

  return (
    <>
      {/* ---------------------------------------------------------------
          Above the fold: what this is, and the single email field.
          The 1 Kings 19:18 framing comes first, per the brief.
      --------------------------------------------------------------- */}
      <section className="mx-auto max-w-3xl px-5 pb-16 pt-14 sm:pt-20">
        <p className="font-pixel text-[0.55rem] uppercase tracking-[0.2em] text-green-600">
          1 Kings 19:18
        </p>

        <h1 className="mt-5 font-serif text-4xl font-bold leading-[1.15] tracking-tight text-ink sm:text-5xl">
          You are not the only one left.
        </h1>

        <div className="mt-6 max-w-[var(--container-measure)] space-y-4 font-serif text-lg leading-relaxed text-ink-soft">
          <p>
            Elijah had just seen fire fall from heaven. Days later he sat under a tree in the
            desert and told God he was the only faithful person left in Israel — and that he
            would rather die.
          </p>
          <p>
            God&rsquo;s answer was not a rebuke. It was a number.{' '}
            <em className="text-ink">Seven thousand</em> others had not bowed to Baal. Elijah
            simply could not see them from where he was sitting.
          </p>
          <p>
            Testimonies of God at work today are scattered across small local outlets that
            almost nobody reads together. <strong className="font-semibold text-ink">The 7000</strong>{' '}
            gathers them from across Southeast Asia, checks them against their sources, and sends
            you one short email each morning — so you can see the others too.
          </p>
        </div>

        <div className="mt-10 max-w-xl">
          <SubscribeForm />
        </div>

        {edition && (
          <p className="mt-8 font-sans text-sm text-ink-faint">
            Most recent edition:{' '}
            <Link href={`/archive/${edition.edition_date}`} className="text-green-700 underline underline-offset-4">
              {new Date(edition.edition_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
              })}
            </Link>
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------
          The pixel journey. Below the email field, above the deeper
          explanation, per the brief's recommended placement.
      --------------------------------------------------------------- */}
      <PixelStory />

      {/* ---------------------------------------------------------------
          Why this exists
      --------------------------------------------------------------- */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-ink">
          What arrives in your inbox
        </h2>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {[
            {
              n: '01',
              h: 'Real testimonies, summarised',
              p: 'A handful of stories a day, each in five or six sentences, always with a link straight to the outlet that reported it.',
            },
            {
              n: '02',
              h: 'Gathered by country',
              p: 'Singapore, Malaysia, Indonesia and more as we find outlets worth trusting. Countries with nothing to report that day are simply left out.',
            },
            {
              n: '03',
              h: 'One thread pulled together',
              p: 'A short closing reflection on what the day looked like across the region as a whole.',
            },
          ].map((c) => (
            <div key={c.n}>
              <p className="font-pixel text-[0.6rem] text-green-600">{c.n}</p>
              <h3 className="mt-3 font-serif text-xl font-bold text-ink">{c.h}</h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-ink-soft">{c.p}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-lg border border-rule bg-paper-alt p-6 sm:p-8">
          <h3 className="font-serif text-xl font-bold text-ink">How we handle the sources</h3>
          <p className="mt-3 font-sans text-sm leading-relaxed text-ink-soft">
            We only summarise; we never republish. Every outlet we follow is checked for whether it
            publishes real testimony, quotes identifiable people, and holds to broadly Protestant
            teaching — and the full reasoning behind every decision is written down and kept.
            You can see the current list, and how often each one publishes, on the{' '}
            <Link href="/sources" className="text-green-700 underline underline-offset-4">
              sources page
            </Link>
            .
          </p>
          <p className="mt-3 font-sans text-sm leading-relaxed text-ink-soft">
            Know an outlet we should be reading?{' '}
            <Link href="/suggest" className="text-green-700 underline underline-offset-4">
              Tell us about it
            </Link>
            . The list is meant to grow.
          </p>
        </div>
      </section>

      {/* Closing capture, for readers who scrolled the whole story. */}
      <section className="border-t border-rule bg-green-50 py-16">
        <div className="mx-auto max-w-xl px-5 text-center">
          <h2 className="font-serif text-2xl font-bold text-ink">
            Start tomorrow morning.
          </h2>
          <p className="mt-2 font-sans text-sm text-ink-soft">
            7am Singapore time, every day there is something worth sending.
          </p>
          <div className="mt-6 text-left">
            <SubscribeForm compact />
          </div>
        </div>
      </section>
    </>
  );
}
