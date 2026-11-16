import { useEffect } from 'react';

export function App({ pathname }: { pathname: string }) {
  const home = pathname === '/';
  const pageTwo = pathname === '/page-two';
  const title = home ? 'React SDK' : pageTwo ? 'Page Two' : 'Page not found';
  useEffect(() => {
    document.title = `${title} – Contentful Experiences`;
  }, [title]);

  return (
    <div className="app-shell">
      <nav className="app-nav" id="app-nav" aria-label="Main navigation">
        <a
          href="/"
          className={home ? 'active' : undefined}
          aria-current={home ? 'page' : undefined}
          data-testid="link-home"
        >
          Home
        </a>
        <a
          href="/page-two"
          className={pageTwo ? 'active' : undefined}
          aria-current={pageTwo ? 'page' : undefined}
          data-testid="link-page-two"
        >
          Page Two
        </a>
      </nav>
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Tracking">
          <section className="tracking-log" data-testid="analytics-events-container">
            <div className="tracking-log__header">
              <h2>Tracking</h2>
            </div>
            <p className="tracking-log__empty">
              Event observation becomes available with the runtime integration. This shell does not
              submit or observe events.
            </p>
          </section>
        </aside>
        <main className="app-main" id="app-main" tabIndex={-1}>
          <div
            className="page-header"
            data-testid={home ? 'home-view' : pageTwo ? 'page-two-view' : 'not-found-view'}
          >
            {!home && (
              <a href="/" data-testid="link-back-home">
                Back to Home
              </a>
            )}
            <h1>{title}</h1>
            <p className="page-header__subtitle">
              {home || pageTwo
                ? 'Standalone React reference foundation for @contentful/experiences-react.'
                : 'This reference has Home and Page Two routes.'}
            </p>
          </div>
          {(home || pageTwo) && (
            <>
              <section className="control-panel" aria-label="Utilities">
                <h2 className="control-panel__title">Utilities</h2>
                <p className="control-panel__note">
                  Consent and visitor actions will accompany SDK ownership. The foundation runs
                  without credentials and creates no SDK instance.
                </p>
              </section>
              <div className="sections-grid sections-grid--split">
                <section className="page-section">
                  <header className="page-section__header">
                    <h2>Automatically tracked Experiences</h2>
                    <p>
                      Experience rendering and automatic tracking follow in the renderer and runtime
                      integrations.
                    </p>
                  </header>
                </section>
                <section className="page-section">
                  <header className="page-section__header">
                    <h2>Manually observed Experiences</h2>
                    <p>
                      Manual root registration follows once real plans and SDK tracking are
                      available.
                    </p>
                  </header>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
