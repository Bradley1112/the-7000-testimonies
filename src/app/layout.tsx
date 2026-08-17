import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'the7000testimonies@gmail.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'The 7000 — daily testimonies from across Southeast Asia',
    template: '%s · The 7000',
  },
  description:
    'A daily newsletter collecting real testimonies of God at work across Southeast Asia. ' +
    'Named after 1 Kings 19:18 — a reminder that you are not the only one left.',
  openGraph: {
    title: 'The 7000',
    description: 'Daily testimonies of God at work across Southeast Asia.',
    url: SITE_URL,
    siteName: 'The 7000',
    images: ['/email/banner-scene4.png'],
    type: 'website',
  },
};

function Nav() {
  return (
    <nav className="border-b border-rule bg-paper/95 sticky top-0 z-50 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-baseline gap-6 px-5 py-4">
        <Link href="/" className="font-serif text-lg font-bold tracking-tight text-green-700">
          The 7000
        </Link>
        <div className="ml-auto flex gap-5 font-sans text-sm text-ink-soft">
          <Link href="/archive" className="hover:text-green-700 hover:underline underline-offset-4">
            Archive
          </Link>
          <Link href="/sources" className="hover:text-green-700 hover:underline underline-offset-4">
            Sources
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-rule bg-green-50">
      <div className="mx-auto max-w-5xl px-5 py-12 font-sans text-sm text-ink-soft">
        <p className="font-serif text-base text-ink">
          &ldquo;Yet I reserve seven thousand in Israel&mdash;all whose knees have not bowed to Baal.&rdquo;
          <span className="text-ink-faint"> &mdash; 1 Kings 19:18</span>
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-semibold text-ink">Reading</h2>
            <ul className="mt-2 space-y-1">
              <li><Link href="/archive" className="hover:text-green-700 hover:underline">Archive</Link></li>
              <li><Link href="/sources" className="hover:text-green-700 hover:underline">Sources we follow</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-ink">Contribute</h2>
            <ul className="mt-2 space-y-1">
              <li><Link href="/suggest" className="hover:text-green-700 hover:underline">Suggest a source</Link></li>
              <li><a href={`mailto:${CONTACT}`} className="hover:text-green-700 hover:underline">Contact us</a></li>
            </ul>
          </div>
          <div>
            {/* Required by the brief: a standing contact point for outlets that
                object to being summarised and linked. Kept prominent, not buried. */}
            <h2 className="font-semibold text-ink">For publishers</h2>
            <p className="mt-2">
              We summarise and link; we never republish full articles. If you publish one of
              our sources and would like your work handled differently, or removed, write to{' '}
              <a href={`mailto:${CONTACT}`} className="text-green-700 underline">{CONTACT}</a> and
              we will act on it.
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-rule pt-6 text-xs text-ink-faint">
          The 7000 links to original reporting by independent outlets and does not reproduce their
          articles. All testimonies remain the work of the publications that reported them.
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        {/* If JS never runs, the IntersectionObserver never fires and every
            scroll-story layer would stay at opacity 0. Reveal them all instead. */}
        <noscript>
          <style>{`.scene-layer{opacity:1 !important;transform:none !important}
                   .typewriter{width:auto !important;white-space:normal !important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-green-700 focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
