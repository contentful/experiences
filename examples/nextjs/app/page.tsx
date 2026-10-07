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

      <form action="/landing" method="get">
        <p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
            <input type="checkbox" name="personalization" value="true" />
            Personalization (send a page event as an EU visitor)
          </label>
        </p>
        <button type="submit" style={{ ...linkStyle, border: 0, cursor: 'pointer', fontSize: 16 }}>
          View the demo experience
        </button>
      </form>

      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 24, marginBottom: 0 }}>
        <code>landing</code> is the id the bootstrap script (<code>examples/scripts</code>) seeds by
        default. Replace it in the URL with any other Experience id from your space. Append{' '}
        <code>?preview=true</code> to read from the preview API (requires <code>CPA_TOKEN</code>).
      </p>
    </main>
  );
}
