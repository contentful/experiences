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

      <p>
        <Link href="/landing" style={linkStyle}>
          View the demo experience
        </Link>
      </p>

      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 24, marginBottom: 0 }}>
        <code>landing</code> is the id the bootstrap script (<code>examples/scripts</code>) seeds by
        default. Replace it in the URL with any other Experience id from your space. Append{' '}
        <code>?preview=true</code> to read from the preview API (requires <code>CPA_TOKEN</code>).
      </p>
    </main>
  );
}
