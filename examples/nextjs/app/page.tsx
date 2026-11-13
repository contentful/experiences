import Link from 'next/link';

import { flag, renderDestinationPage, type SearchParams } from '@/lib/destination-page';

interface PageProps {
  searchParams?: Promise<SearchParams>;
}

const panel = {
  maxWidth: 720,
  margin: '40px auto',
  padding: 32,
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
} as const;

const muted = { color: '#4b5563' } as const;
const code = { background: '#f3f4f6', padding: '1px 4px', borderRadius: 4 } as const;

/**
 * The demo hub at `/`. It explains the example and links to every route, then
 * renders the Destination's home node (empty path) underneath, so `/` is both
 * the start page and the home page.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const personalization = flag(sp.personalization);
  const debug = flag(sp.debug);

  // Carry the toggles onto the destination links.
  const flags = new globalThis.URLSearchParams();
  if (personalization) flags.set('personalization', 'true');
  if (debug) flags.set('debug', 'true');
  const withFlags = (href: string) => (flags.size ? `${href}?${flags}` : href);

  return (
    <>
      <main style={panel}>
        <h1 style={{ marginTop: 0 }}>Contentful Experiences — Next.js example</h1>
        <p style={muted}>
          This app renders Contentful Experiences with <code>@contentful/experiences-nextjs</code>{' '}
          with managed Next.js App Router bindings. Pages are served from a{' '}
          <strong>Destination</strong>: the URL path is the Destination path. One Experience can
          also be fetched <strong>by id</strong>, which is the route for Preview Sessions and
          runtime parameters. The home Experience for this page is rendered below.
        </p>

        <form method="get" action="/">
          <p style={{ marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
              <input
                type="checkbox"
                name="personalization"
                value="true"
                defaultChecked={personalization}
              />
              Simulate an EU visitor
            </label>
          </p>
          <p style={{ marginTop: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
              <input type="checkbox" name="debug" value="true" defaultChecked={debug} />
              Debug output
            </label>
          </p>
          <button type="submit" style={{ padding: '6px 12px', cursor: 'pointer' }}>
            Apply
          </button>
        </form>

        <h2>Destination pages</h2>
        <ul>
          <li>
            <Link href={withFlags('/')}>/</Link>: the home node (this page)
          </li>
          <li>
            <Link href={withFlags('/demo/landing')}>/demo/landing</Link>: the <code>landing</code>{' '}
            Experience
          </li>
          <li>
            <Link href="/welcome">/welcome</Link>: a redirect node, sends you back to <code>/</code>
          </li>
          <li>Any other path is a 404.</li>
        </ul>
        <p style={muted}>
          Options: <code style={code}>?personalization=true</code>,{' '}
          <code style={code}>?debug=true</code>, <code style={code}>?locale=de-DE</code> (content,
          resolver and event locale). Preview is demonstrated on the by-id route.
        </p>

        <h2>By Experience id</h2>
        <ul>
          <li>
            <Link href={withFlags('/experiences/landing')}>/experiences/landing</Link>: fetch the
            seeded <code>landing</code> Experience by id
          </li>
        </ul>
        <p style={muted}>
          Options on <code style={code}>/experiences/&lt;id&gt;</code>:
        </p>
        <ul style={muted}>
          <li>
            <code style={code}>?personalization=true</code>, <code style={code}>?debug=true</code>,{' '}
            <code style={code}>?locale=de-DE</code>
          </li>
          <li>
            <code style={code}>?preview_session_id=&lt;id&gt;</code>: live preview. The Contentful
            app supplies the id (needs server and browser preview credentials)
          </li>
          <li>
            <code style={code}>?parameter_demo=true</code>: show the runtime parameters form. The
            seeded <code>landing</code> declares none, so use an Experience that does
          </li>
        </ul>
      </main>

      {await renderDestinationPage()}
    </>
  );
}
