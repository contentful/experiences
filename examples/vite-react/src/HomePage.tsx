const linkStyle = {
  display: 'inline-block',
  padding: '10px 16px',
  borderRadius: 8,
  background: '#4f39f6',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 500,
};

export function HomePage() {
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
      <h1 style={{ marginTop: 0 }}>Contentful Experiences — Vite + React example</h1>
      <p style={{ color: '#4b5563' }}>
        This app fetches, resolves, and renders a Contentful Experience entirely in the browser with{' '}
        <code>@contentful/experiences-react</code>. There is no server.
      </p>

      <a href="/landing" style={linkStyle}>
        View the demo experience
      </a>

      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 24, marginBottom: 0 }}>
        <code>landing</code> is the id the bootstrap script (<code>examples/scripts</code>) seeds by
        default. Replace it in the URL with any other Experience id from your space. Append{' '}
        <code>?debug=true</code> to turn on SDK logging and show the resolved Experience in a debug
        panel.
      </p>
    </main>
  );
}
