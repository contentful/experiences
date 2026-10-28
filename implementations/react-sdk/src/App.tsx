import { useEffect, useState } from 'react';

import type { PublicEnvironment } from '../public-config';
import { getRouteExperienceIds, type PageContent } from './content-loader';
import { ExperiencePresentation } from './ExperiencePresentation';

export function App({
  pathname,
  environment,
  content,
}: {
  pathname: string;
  environment: PublicEnvironment;
  content: Promise<PageContent>;
}) {
  const [loaded, setLoaded] = useState<PageContent>();
  const ids = getRouteExperienceIds(environment, pathname);
  useEffect(() => {
    let active = true;
    void content.then((result) => {
      if (active) setLoaded(result);
    });
    return () => {
      active = false;
    };
  }, [content]);
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
              Event observation becomes available with the runtime integration. This reference does
              not submit or observe events.
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
                ? 'Standalone React rendering reference for @contentful/experiences-react.'
                : 'This reference has Home and Page Two routes.'}
            </p>
          </div>
          {(home || pageTwo) && (
            <>
              <section className="control-panel" aria-label="Utilities">
                <h2 className="control-panel__title">Utilities</h2>
                <p className="control-panel__note">
                  Content uses the application-owned free fetch path. No Web SDK instance is
                  created; consent and visitor actions are not available yet.
                </p>
              </section>
              <div className="sections-grid sections-grid--split">
                <section className="page-section">
                  <header className="page-section__header">
                    <h2>Experiences with automatic tracking defaults</h2>
                    <p>
                      Standard rendering stamps source-map attribution on actual DOM roots.
                      Interaction measurement requires a Web SDK instance, which is not connected
                      yet.
                    </p>
                  </header>
                  <div className="entry-grid entry-grid--experiences">
                    {ids.automatic.map((id) => (
                      <ExperiencePresentation key={id} experienceId={id} result={loaded?.[id]} />
                    ))}
                  </div>
                </section>
                <section className="page-section">
                  <header className="page-section__header">
                    <h2>Experiences for manual view registration</h2>
                    <p>
                      The first plan is reused twice with distinct DOM roots. Attribution is
                      retained and automatic views, hovers and clicks are disabled. Manual
                      registration and measurement are not connected yet.
                    </p>
                  </header>
                  <div className="entry-grid entry-grid--experiences">
                    {ids.manual.map((id) => (
                      <ExperiencePresentation
                        key={id}
                        experienceId={id}
                        result={loaded?.[id]}
                        manual
                      />
                    ))}
                    {ids.manual.map((id) => (
                      <ExperiencePresentation
                        key={`${id}-repeat`}
                        experienceId={id}
                        result={loaded?.[id]}
                        manual
                        repeated
                      />
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
