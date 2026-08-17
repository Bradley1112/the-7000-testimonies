import Link from 'next/link';
import { publicClient, type Source, type Country, type EvidenceLink } from '@/lib/supabase';

export const metadata = {
  title: 'Sources',
  description:
    'The Southeast Asian Christian outlets The 7000 follows, grouped by country, with denomination, credibility evidence and how often each one publishes.',
};

// Static/manually refreshed, per the brief — this page only changes when a
// source is added, removed or flagged. A day of cache is generous.
export const revalidate = 86400;

const PERSPECTIVE_LABEL: Record<string, { label: string; explain: string }> = {
  local: {
    label: 'Local outlet',
    explain: 'Based in, and reporting on, its own country.',
  },
  regional: {
    label: 'Regional outlet',
    explain: 'Covers several countries from a desk in the region.',
  },
  external: {
    label: 'Reported from outside the region',
    explain:
      'A newsroom based outside Southeast Asia reporting on it. Their stories tend to quote mission staff rather than local church leaders, so we rank them below local reporting.',
  },
};

async function getData() {
  try {
    const supabase = publicClient();
    const [{ data: sources }, { data: countries }] = await Promise.all([
      supabase.from('sources').select('*').eq('status', 'approved').order('credibility_score', { ascending: false }),
      supabase.from('countries').select('code, name'),
    ]);
    return {
      sources: (sources ?? []) as Source[],
      countries: (countries ?? []) as Country[],
    };
  } catch {
    return { sources: [], countries: [] };
  }
}

function EvidenceList({ links }: { links: EvidenceLink[] }) {
  if (!links?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {links.map((l) => (
        <li key={l.url}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-sans text-xs text-green-700 underline decoration-green-300 underline-offset-2 hover:decoration-green-700"
          >
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function SourceCard({ source }: { source: Source }) {
  const p = PERSPECTIVE_LABEL[source.source_perspective] ?? PERSPECTIVE_LABEL.local;
  return (
    <article className="border-t border-rule py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-xl font-bold text-ink">
          <a
            href={source.homepage_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-green-700 hover:underline underline-offset-4"
          >
            {source.name}
          </a>
        </h3>
        <span className="font-sans text-xs text-ink-faint">{source.update_cadence}</span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 font-sans text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-faint">Denomination</dt>
          <dd className="text-ink-soft">{source.denomination}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-faint">Perspective</dt>
          <dd className="text-ink-soft">
            {p.label}
            {source.needs_translation && (
              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
                Translated to English
              </span>
            )}
          </dd>
        </div>
      </dl>

      {source.source_perspective === 'external' && (
        <p className="mt-2 font-sans text-xs italic leading-relaxed text-ink-faint">{p.explain}</p>
      )}

      <div className="mt-3">
        <p className="font-sans text-xs uppercase tracking-wide text-ink-faint">Credibility evidence</p>
        <EvidenceList links={source.evidence_urls} />
      </div>
    </article>
  );
}

export default async function SourcesPage() {
  const { sources, countries } = await getData();
  const nameOf = new Map(countries.map((c) => [c.code, c.name]));

  const byCountry = new Map<string, Source[]>();
  const regional: Source[] = [];
  for (const s of sources) {
    if (s.is_regional || !s.country_code) { regional.push(s); continue; }
    const list = byCountry.get(s.country_code) ?? [];
    list.push(s);
    byCountry.set(s.country_code, list);
  }
  // Countries with no approved source are simply absent, per the brief — never
  // rendered as an empty or failed section.
  const countryGroups = [...byCountry.entries()].sort(
    (a, b) => (nameOf.get(a[0]) ?? a[0]).localeCompare(nameOf.get(b[0]) ?? b[0])
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">Sources</h1>
      <div className="mt-4 max-w-[var(--container-measure)] space-y-3 font-serif text-lg leading-relaxed text-ink-soft">
        <p>
          These are the outlets we read each day. Every one was checked for whether it actually
          publishes testimony, whether its stories name real people, whether its teaching sits
          within broadly Protestant orthodoxy, and whether anyone independent vouches for it.
        </p>
        <p className="font-sans text-sm">
          Countries appear here only once we have found an outlet worth following. Several
          Southeast Asian countries are missing for that reason, and we would rather leave them
          out than fill the gap with something we do not trust.
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="mt-12 rounded-md border border-rule bg-paper-alt p-6 font-sans text-sm text-ink-soft">
          The source list is not available right now. If you are running this locally, apply the
          database migrations first — see the README.
        </p>
      ) : (
        <>
          {countryGroups.map(([code, list]) => (
            <section key={code} className="mt-12">
              <h2 className="font-serif text-2xl font-bold text-green-700">
                {nameOf.get(code) ?? code}
              </h2>
              <div className="mt-2">
                {list.map((s) => <SourceCard key={s.id} source={s} />)}
              </div>
            </section>
          ))}

          {regional.length > 0 && (
            <section className="mt-12">
              <h2 className="font-serif text-2xl font-bold text-green-700">Across the region</h2>
              <p className="mt-1 font-sans text-sm text-ink-faint">
                Outlets that cover more than one country. Their stories are filed under whichever
                country they concern.
              </p>
              <div className="mt-2">
                {regional.map((s) => <SourceCard key={s.id} source={s} />)}
              </div>
            </section>
          )}
        </>
      )}

      <aside className="mt-16 rounded-lg border border-green-300 bg-green-50 p-6">
        <h2 className="font-serif text-xl font-bold text-ink">Know one we&rsquo;ve missed?</h2>
        <p className="mt-2 font-sans text-sm leading-relaxed text-ink-soft">
          This list is meant to grow, and the gaps are real — we are especially short of outlets in
          Thailand, Vietnam, Cambodia and Myanmar.{' '}
          <Link href="/suggest" className="text-green-700 underline underline-offset-4">
            Suggest a source
          </Link>{' '}
          and we will vet it.
        </p>
      </aside>
    </div>
  );
}
