import SuggestForm from '@/components/SuggestForm';

export const metadata = {
  title: 'Suggest a source',
  description: 'Nominate a Southeast Asian Christian outlet for The 7000 to read and vet.',
};

const GAPS = [
  ['Thailand', 'Nothing found beyond denominational bodies and foreign mission agencies.'],
  ['Vietnam', 'The searchable Protestant web is mostly diaspora congregations abroad.'],
  ['Cambodia', 'Remarkable church growth, but the reporting is all by outside observers.'],
  ['Myanmar', 'Substantial churches, no web-publishing news arm we could find.'],
  ['Philippines', 'The evangelical council’s news feed has been dormant since 2022.'],
];

export default function SuggestPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">Suggest a source</h1>

      <div className="mt-4 space-y-3 font-serif text-lg leading-relaxed text-ink-soft">
        <p>
          We can only summarise what we can find, and we are certain we are missing outlets —
          especially ones publishing in languages other than English. If you read something
          worth including, tell us and we will vet it.
        </p>
        <p className="font-sans text-sm">
          We look for outlets that publish real testimony, name the people in their stories, hold
          to broadly Protestant teaching, and can be independently vouched for. Language is not a
          barrier — we translate.
        </p>
      </div>

      <section className="mt-10 rounded-lg border border-rule bg-paper-alt p-6">
        <h2 className="font-serif text-xl font-bold text-ink">Where we are most short</h2>
        <dl className="mt-4 space-y-3">
          {GAPS.map(([country, why]) => (
            <div key={country} className="sm:flex sm:gap-4">
              <dt className="font-sans text-sm font-semibold text-green-700 sm:w-32 sm:shrink-0">
                {country}
              </dt>
              <dd className="font-sans text-sm leading-relaxed text-ink-soft">{why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12">
        <SuggestForm />
      </div>
    </div>
  );
}
