import Link from 'next/link';

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
      <p style={{ color: '#4b5563' }}>
        Without <code>EXPERIENCES_CDA_TOKEN</code> set in <code>.env.local</code>, the app uses a
        built-in mock payload so it works out of the box.
      </p>
      <p>
        <Link
          href="/demo"
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            borderRadius: 8,
            background: '#4f39f6',
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          View the demo experience
        </Link>
      </p>
    </main>
  );
}
