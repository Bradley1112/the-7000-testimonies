import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { serviceClient } from '@/lib/supabase';
import SignOutButton from '@/components/SignOutButton';

export const metadata = { title: 'Admin', robots: { index: false, follow: false } };
// Never cache: this page shows live operational state, and caching an
// authenticated page risks serving one visitor's view to another.
export const dynamic = 'force-dynamic';

async function loadDashboard() {
  const db = serviceClient();

  const [subs, sources, feedback, failures, vetting, editions, suggestions] = await Promise.all([
    db.from('subscribers').select('status'),
    db.from('sources').select('id, name, country_code, status, update_cadence, source_perspective')
      .eq('status', 'approved'),
    db.from('feedback').select('id, rating, comment, created_at, testimony_id')
      .order('created_at', { ascending: false }).limit(30),
    db.from('scrape_failures').select('source_name, stage, error_message, url, created_at')
      .order('created_at', { ascending: false }).limit(30),
    db.from('source_vetting_log')
      .select('id, candidate_name, candidate_url, country_code, verdict, decided_by, created_at')
      .order('created_at', { ascending: false }).limit(40),
    db.from('editions').select('edition_date, status, email_recipient_count, no_send_reason')
      .order('edition_date', { ascending: false }).limit(10),
    db.from('source_suggestions').select('outlet_name, outlet_url, country_code, note, created_at, reviewed')
      .eq('reviewed', false).order('created_at', { ascending: false }).limit(20),
  ]);

  const statuses = (subs.data ?? []) as { status: string }[];
  return {
    subscriberCounts: {
      confirmed: statuses.filter((s) => s.status === 'confirmed').length,
      pending: statuses.filter((s) => s.status === 'pending').length,
      unsubscribed: statuses.filter((s) => s.status === 'unsubscribed').length,
    },
    sources: sources.data ?? [],
    feedback: feedback.data ?? [],
    failures: failures.data ?? [],
    vetting: vetting.data ?? [],
    editions: editions.data ?? [],
    suggestions: suggestions.data ?? [],
  };
}

function Card({ label, value, tone = 'normal' }: { label: string; value: string | number; tone?: 'normal' | 'warn' }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === 'warn' && value !== 0 ? 'border-amber-400 bg-amber-50' : 'border-rule bg-paper-alt'}`}>
      <p className="font-sans text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 font-serif text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl font-bold text-green-700">{title}</h2>
      {subtitle && <p className="mt-1 font-sans text-sm text-ink-faint">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const td = 'px-3 py-2 align-top font-sans text-sm text-ink-soft';
const th = 'px-3 py-2 text-left font-sans text-xs uppercase tracking-wide text-ink-faint';

export default async function AdminPage() {
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  let data;
  try {
    data = await loadDashboard();
  } catch (err) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-serif text-3xl font-bold text-ink">Admin</h1>
        <p className="mt-4 rounded border border-amber-400 bg-amber-50 p-4 font-sans text-sm text-ink-soft">
          Could not load the dashboard. Check that SUPABASE_SERVICE_ROLE_KEY is set and the
          migrations have been applied.
          <br /><br />
          <code className="text-xs">{err instanceof Error ? err.message : String(err)}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">Admin</h1>
          <p className="mt-1 font-sans text-sm text-ink-faint">Signed in as {session.email}</p>
        </div>
        <SignOutButton />
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Confirmed subscribers" value={data.subscriberCounts.confirmed} />
        <Card label="Awaiting confirmation" value={data.subscriberCounts.pending} />
        <Card label="Active sources" value={data.sources.length} />
        <Card label="Recent scrape failures" value={data.failures.length} tone="warn" />
      </div>

      <Section title="Recent editions">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-rule">
            <th className={th}>Date</th><th className={th}>Status</th>
            <th className={th}>Sent to</th><th className={th}>Note</th>
          </tr></thead>
          <tbody>
            {data.editions.length === 0 && (
              <tr><td className={td} colSpan={4}>No editions yet.</td></tr>
            )}
            {data.editions.map((e) => (
              <tr key={e.edition_date} className="border-b border-rule">
                <td className={td}>
                  {e.status === 'published'
                    ? <Link href={`/archive/${e.edition_date}`} className="text-green-700 underline">{e.edition_date}</Link>
                    : e.edition_date}
                </td>
                <td className={td}>{e.status}</td>
                <td className={td}>{e.email_recipient_count ?? '—'}</td>
                <td className={td}>{e.no_send_reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Active sources" subtitle="Change these in the database; this view is read-only by design.">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-rule">
            <th className={th}>Source</th><th className={th}>Country</th>
            <th className={th}>Cadence</th><th className={th}>Perspective</th>
          </tr></thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.id} className="border-b border-rule">
                <td className={td}>{s.name}</td>
                <td className={td}>{s.country_code ?? 'regional'}</td>
                <td className={td}>{s.update_cadence}</td>
                <td className={td}>{s.source_perspective}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Feedback inbox"
        subtitle="Site thumbs and comments. Email replies go to your Gmail — there is no inbound parsing (see README)."
      >
        {data.feedback.length === 0 ? (
          <p className="font-sans text-sm text-ink-faint">No feedback yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.feedback.map((f) => (
              <li key={f.id} className="rounded border border-rule p-3">
                <p className="font-sans text-sm">
                  <span className="mr-2">{f.rating === 'up' ? '👍' : f.rating === 'down' ? '👎' : '💬'}</span>
                  <span className="text-ink-faint">{new Date(f.created_at).toLocaleString('en-GB')}</span>
                </p>
                {f.comment && <p className="mt-1 font-serif text-base text-ink">{f.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Suggested sources" subtitle="Reader nominations awaiting a vetting round.">
        {data.suggestions.length === 0 ? (
          <p className="font-sans text-sm text-ink-faint">Nothing pending.</p>
        ) : (
          <ul className="space-y-3">
            {data.suggestions.map((s) => (
              <li key={s.outlet_url} className="rounded border border-rule p-3">
                <p className="font-sans text-sm font-semibold text-ink">
                  {s.outlet_name} <span className="font-normal text-ink-faint">({s.country_code ?? 'regional'})</span>
                </p>
                <a href={s.outlet_url} target="_blank" rel="noopener noreferrer" className="font-sans text-xs text-green-700 underline">
                  {s.outlet_url}
                </a>
                {s.note && <p className="mt-1 font-sans text-sm text-ink-soft">{s.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Scrape failures" subtitle="A source failing here is skipped for the day, never fatal to the run.">
        {data.failures.length === 0 ? (
          <p className="font-sans text-sm text-ink-faint">No failures logged.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-rule">
              <th className={th}>When</th><th className={th}>Source</th>
              <th className={th}>Stage</th><th className={th}>Error</th>
            </tr></thead>
            <tbody>
              {data.failures.map((f, i) => (
                <tr key={i} className="border-b border-rule">
                  <td className={td}>{new Date(f.created_at).toLocaleString('en-GB')}</td>
                  <td className={td}>{f.source_name}</td>
                  <td className={td}>{f.stage}</td>
                  <td className={`${td} max-w-xs truncate`} title={f.error_message}>{f.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Source vetting log"
        subtitle="Every vetting decision, newest first. Full chain-of-thought is in the reasoning column — read it in Supabase; it is long by design."
      >
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-rule">
            <th className={th}>When</th><th className={th}>Candidate</th>
            <th className={th}>Country</th><th className={th}>Verdict</th><th className={th}>By</th>
          </tr></thead>
          <tbody>
            {data.vetting.map((v) => (
              <tr key={v.id} className="border-b border-rule">
                <td className={td}>{new Date(v.created_at).toLocaleDateString('en-GB')}</td>
                <td className={td}>
                  <a href={v.candidate_url} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
                    {v.candidate_name}
                  </a>
                </td>
                <td className={td}>{v.country_code ?? '—'}</td>
                <td className={td}>
                  <span className={
                    v.verdict === 'approved' ? 'text-green-700'
                      : v.verdict === 'rejected' ? 'text-red-700' : 'text-amber-700'
                  }>{v.verdict}</span>
                </td>
                <td className={td}>{v.decided_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 rounded border border-rule bg-paper-alt p-3 font-sans text-xs leading-relaxed text-ink-soft">
          To read the full reasoning for a decision, open the Supabase table editor and run:
          <br />
          <code className="mt-1 block text-[11px]">
            select candidate_name, verdict, criteria, reasoning, evidence from source_vetting_log order by created_at desc;
          </code>
        </p>
      </Section>
    </div>
  );
}
