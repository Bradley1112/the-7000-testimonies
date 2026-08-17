import { publicClient, type Edition, type Testimony, type CountrySummary, type Country, type Source } from './supabase';

/**
 * Read helpers for editions. Shared by the archive pages and the daily email
 * renderer, so the site and the inbox can never drift apart in what they show.
 */

export interface RenderedEdition extends Edition {
  countrySummaries: CountrySummary[];
  testimonies: Testimony[];
  countryNames: Map<string, string>;
  sourceNames: Map<string, string>;
}

export function formatEditionDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** Countries in the order they should appear, driven by how much they carried. */
export function orderCountries(edition: RenderedEdition): string[] {
  const counts = new Map<string, number>();
  for (const t of edition.testimonies) {
    counts.set(t.country_code, (counts.get(t.country_code) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff !== 0) return diff;
    return (edition.countryNames.get(a) ?? a).localeCompare(edition.countryNames.get(b) ?? b);
  });
}

export async function listEditions(limit = 60) {
  try {
    const supabase = publicClient();
    const { data } = await supabase
      .from('editions')
      .select('id, edition_date, status, consolidation_summary')
      .eq('status', 'published')
      .order('edition_date', { ascending: false })
      .limit(limit);
    return (data ?? []) as Edition[];
  } catch {
    return [];
  }
}

export async function getEdition(date: string): Promise<RenderedEdition | null> {
  try {
    const supabase = publicClient();

    const { data: edition } = await supabase
      .from('editions')
      .select('id, edition_date, status, consolidation_summary')
      .eq('edition_date', date)
      .eq('status', 'published')
      .maybeSingle();

    if (!edition) return null;

    const [{ data: testimonies }, { data: summaries }, { data: countries }, { data: sources }] =
      await Promise.all([
        supabase.from('testimonies').select('*').eq('edition_id', edition.id).order('rank'),
        supabase.from('country_summaries').select('country_code, summary').eq('edition_id', edition.id),
        supabase.from('countries').select('code, name'),
        supabase.from('sources').select('id, name'),
      ]);

    return {
      ...(edition as Edition),
      testimonies: (testimonies ?? []) as Testimony[],
      countrySummaries: (summaries ?? []) as CountrySummary[],
      countryNames: new Map(((countries ?? []) as Country[]).map((c) => [c.code, c.name])),
      sourceNames: new Map((((sources ?? []) as Pick<Source, 'id' | 'name'>[])).map((s) => [s.id, s.name])),
    };
  } catch {
    return null;
  }
}
