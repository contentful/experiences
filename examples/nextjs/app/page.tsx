import Link from 'next/link';

const linkStyle = {
  display: 'inline-block',
  padding: '10px 16px',
  borderRadius: 8,
  background: '#4f39f6',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 500,
};

const secondaryLinkStyle = {
  ...linkStyle,
  background: '#ffffff',
  color: '#1f2937',
  border: '1px solid #d1d5db',
};

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '40px auto',
        padding: 32,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
      }}
    >
      <h1 style={{ marginTop: 0 }}>Contentful Experiences — Next.js example</h1>
      <p style={{ color: '#4b5563' }}>
        This app demonstrates rendering a Contentful Experience payload with{' '}
        <code>@contentful/experiences-react</code> in a Next.js App Router server component.
      </p>

      <h2 style={{ marginBottom: 8, fontSize: 18 }}>Two routes, same data</h2>
      <p style={{ color: '#4b5563', marginTop: 0 }}>
        Both routes render the same Experience id. Compare to see what each SDK option buys you.
      </p>

      <ul
        style={{
          paddingLeft: 20,
          color: '#4b5563',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <li>
          <strong>
            <code>/[slug]</code>
          </strong>{' '}
          — minimal three-line page. <code>fetch</code> →{' '}
          <code>resolveExperience(payload, config)</code> →{' '}
          <code>&lt;ServerExperienceRenderer&gt;</code>. No preview mode, no UA seeding, no
          metadata.
        </li>
        <li>
          <strong>
            <code>/advanced/[slug]</code>
          </strong>{' '}
          — same render, opts dialed up: preview mode via <code>?preview=true</code>, User-Agent →{' '}
          <code>initialViewportId</code> for hydration-safe SSR, async <code>resolveData</code> with
          external fetch + per-page metadata.
        </li>
      </ul>

      <p style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Link href="/landing" style={linkStyle}>
          Simple demo
        </Link>
        <Link href="/advanced/landing?preview=true&locale=en-US" style={secondaryLinkStyle}>
          Advanced demo (preview)
        </Link>
      </p>

      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 24, marginBottom: 0 }}>
        <code>landing</code> is the id the bootstrap script (
        <code>examples/scripts</code>) seeds by default. Replace it in the URL with any other
        Experience id from your space.
      </p>
    </main>
  );
}
