import { useEffect, useLayoutEffect, useState } from 'react';
import {
  useExperiencesContext,
  type ManagedExperienceResult,
} from '@contentful/experiences-react/client';
import type { RuntimeFetchExperienceOptions } from '@contentful/experiences-web';

import type { PublicEnvironment } from '../public-config';
import type { AttemptLog } from './attempt-log';
import { ConsentControls } from './ConsentControls';
import { getRouteExperienceIds, loadComparisonContent, type PageContent } from './content-loader';
import { ExperiencePresentation } from './ExperiencePresentation';
import { useManagedExperience } from './experiences';
import { TrackingLog } from './TrackingLog';

export interface PageIntent {
  pathname: string;
  href: string;
  cycle: number;
  personalization?: RuntimeFetchExperienceOptions['personalization'];
}

interface AppProps {
  intent: PageIntent;
  environment: PublicEnvironment;
  log: AttemptLog;
  onIdentify: () => void;
  onReset: () => void;
  onTrack: () => void;
  hidden: boolean;
}
type PageProps = AppProps & { ids: ReturnType<typeof getRouteExperienceIds> };

// Unknown routes and the synchronous reset gap mount no content loader.
export function App(props: AppProps) {
  const page = { ...props, ids: getRouteExperienceIds(props.environment, props.intent.pathname) };
  return props.hidden || !page.ids.automatic.length ? (
    <PageShell {...page} />
  ) : (
    <ManagedPage key={props.intent.cycle} {...page} />
  );
}

// One managed result owns primary content; later IDs are event-free comparisons.
function ManagedPage(props: PageProps) {
  const firstId = props.ids.automatic[0];
  const result = useManagedExperience({
    experienceId: firstId,
    personalization: props.intent.personalization,
  });
  const { sdk, isLive } = useExperiencesContext();
  const [comparisons, setComparisons] = useState<PageContent>({});
  const [pendingAction, setPendingAction] = useState<'identify' | 'track'>();
  const pending = !isLive || result.status === 'loading';
  // Visitor actions join the current initialization before changing request intent.
  // This is presentation state, not a consumer-owned SDK/page subscription.
  useEffect(() => {
    if (pending || !pendingAction) return;
    setPendingAction(undefined);
    if (pendingAction === 'identify') props.onIdentify();
    else props.onTrack();
  }, [pending, pendingAction, props.onIdentify, props.onTrack]);
  const remainingIds = [...new Set([...props.ids.automatic, ...props.ids.manual])].filter(
    (id) => id !== firstId
  );
  const remainingKey = remainingIds.join(',');
  const contentSettled = result.status === 'success' || result.status === 'error';
  useEffect(() => {
    if (!isLive || !contentSettled) return;
    let active = true;
    void loadComparisonContent(sdk, remainingKey ? remainingKey.split(',') : [], () => active).then(
      (content) => {
        if (active) setComparisons(content);
      }
    );
    return () => {
      active = false;
    };
  }, [sdk, isLive, contentSettled, remainingKey]);
  return (
    <PageShell
      {...props}
      result={result}
      comparisons={comparisons}
      onIdentify={() => (pending ? setPendingAction('identify') : props.onIdentify())}
      onTrack={() => (pending ? setPendingAction('track') : props.onTrack())}
      actionPending={pendingAction !== undefined}
    />
  );
}

function PageShell({
  ids,
  intent,
  log,
  onIdentify,
  onReset,
  onTrack,
  hidden,
  result,
  comparisons = {},
  actionPending = false,
}: PageProps & {
  result?: ManagedExperienceResult;
  comparisons?: PageContent;
  actionPending?: boolean;
}) {
  const home = intent.pathname === '/';
  const pageTwo = intent.pathname === '/page-two';
  const title = home ? 'React SDK' : pageTwo ? 'Page Two' : 'Page not found';
  useLayoutEffect(() => {
    document.title = `${title} – Contentful Experiences`;
  }, [title]);
  const currentUrl = new URL(intent.href);
  const identified = currentUrl.searchParams.get('userId') === 'charles';
  function routeUrl(path: string) {
    const url = new URL(path, currentUrl);
    for (const key of ['userId', 'preview_session_id', 'preview_experience_id']) {
      if (currentUrl.searchParams.has(key))
        url.searchParams.set(key, currentUrl.searchParams.get(key) ?? '');
    }
    return url.pathname + url.search;
  }
  const { status, error } = result ?? {};
  function presentation(id: string, manual = false, repeated = false) {
    const primary = id === ids.automatic[0];
    return (
      <ExperiencePresentation
        key={`${id}${repeated ? '-repeat' : ''}`}
        experienceId={id}
        result={primary ? result : comparisons[id]}
        managed={!primary}
        manual={manual}
        repeated={repeated}
      />
    );
  }
  return (
    <div className="app-shell">
      <nav className="app-nav" id="app-nav" aria-label="Main navigation">
        <a
          href={routeUrl('/')}
          className={home ? 'active' : undefined}
          aria-current={home ? 'page' : undefined}
          data-testid="link-home"
        >
          Home
        </a>
        <a
          href={routeUrl('/page-two')}
          className={pageTwo ? 'active' : undefined}
          aria-current={pageTwo ? 'page' : undefined}
          data-testid="link-page-two"
        >
          Page Two
        </a>
      </nav>
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Tracking">
          <TrackingLog log={log} />
        </aside>
        <main className="app-main" id="app-main" tabIndex={-1} aria-busy={status === 'loading'}>
          <div
            className="page-header"
            data-testid={home ? 'home-view' : pageTwo ? 'page-two-view' : 'not-found-view'}
          >
            {!home && (
              <a href={routeUrl('/')} data-testid="link-back-home">
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
              <ConsentControls
                identified={identified}
                onIdentify={onIdentify}
                onReset={onReset}
                onRetry={() => void result?.retry()}
                onTrack={pageTwo ? onTrack : undefined}
                loading={status === 'loading'}
                actionPending={actionPending}
              />
              {error && (
                <p role="alert" className="placeholder-card">
                  {error.message}
                </p>
              )}
              {!hidden && (
                <div
                  className="sections-grid sections-grid--split"
                  data-testid={pageTwo ? 'page-two-experiences' : undefined}
                >
                  <section className="page-section">
                    <header className="page-section__header">
                      <h2>Experiences with automatic tracking defaults</h2>
                      <p>
                        Standard rendering stamps source-map attribution on actual DOM roots. The
                        shared Web SDK measures permitted views, hovers and clicks, subject to
                        consent and profile availability.
                      </p>
                    </header>
                    <div className="entry-grid entry-grid--experiences">
                      {ids.automatic.map((id) => presentation(id))}
                    </div>
                  </section>
                  <section className="page-section">
                    <header className="page-section__header">
                      <h2>Experiences for manual view registration</h2>
                      <p>
                        The first plan is reused twice with distinct DOM roots. Attribution is
                        retained and automatic views, hovers and clicks are disabled. Each
                        attributed root is registered for SDK-measured views through runtime
                        context.
                      </p>
                    </header>
                    <div className="entry-grid entry-grid--experiences">
                      {ids.manual.map((id) => presentation(id, true))}
                      {ids.manual.map((id) => presentation(id, true, true))}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
