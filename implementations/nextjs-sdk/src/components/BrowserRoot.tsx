'use client';

import {
  bindNextjsAppRouterClientExperiences,
  useNextAppAutoPageInputs,
  type BoundNextjsRequestRootProps,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import type { BoundManagedExperienceProps } from '@contentful/experiences-nextjs/client';
import { useRouter as useAppRouter } from 'next/navigation';
import { useRouter as usePagesRouter } from 'next/router';
import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  previewBinding,
  previewConfiguration,
  routeIds,
  type BrowserEnvironment,
} from '../reference';
import { browserRegistry } from './browser-registry';
import { createAttemptLog, type AttemptLog } from './attempt-log';
import { ConsentMirror } from './ConsentMirror';
import { TrackingLog } from './TrackingLog';

interface ReferenceContextValue {
  environment: BrowserEnvironment;
  log: AttemptLog;
  routeKey: string;
  serverOnly: boolean;
  navigate: (href: string, replace?: boolean, shallow?: boolean) => void;
  Experience: (props: BoundManagedExperienceProps) => ReactNode;
  RequestExperience: (props: NextjsRequestExperienceProps) => ReactNode;
}
const ReferenceContext = createContext<ReferenceContextValue | undefined>(undefined);
export function useReference() {
  const reference = useContext(ReferenceContext);
  if (!reference) throw new Error('Reference presentation requires its shared root.');
  return reference;
}

export function AppBrowserRoot({
  environment,
  ...props
}: BoundNextjsRequestRootProps & { environment: BrowserEnvironment }) {
  const [app] = useState(() =>
    bindNextjsAppRouterClientExperiences({ ...environment.web, config: browserRegistry })
  );
  const router = useAppRouter();
  const { routeKey } = useNextAppAutoPageInputs();
  return (
    <ReferenceBrowserRoot
      {...props}
      environment={environment}
      currentRouteKey={routeKey}
      ContentRoot={app.request.ExperiencesRoot}
      AnalyticsRoot={app.request.ExperiencesAnalyticsRoot}
      Experience={app.Experience}
      RequestExperience={app.request.Experience}
      navigate={(href, replace, shallow) =>
        shallow
          ? window.history.replaceState(null, '', href)
          : replace
            ? router.replace(href)
            : router.push(href)
      }
    />
  );
}

export function PagesBrowserRoot({
  environment,
  ...props
}: BoundNextjsRequestRootProps & { environment: BrowserEnvironment }) {
  const [pages] = useState(() =>
    bindNextjsPagesRouterExperiences({ ...environment.web, config: browserRegistry })
  );
  const router = usePagesRouter();
  const routeKey = router.asPath || props.result?.routeKey || '/pages';
  return (
    <ReferenceBrowserRoot
      {...props}
      environment={environment}
      currentRouteKey={routeKey}
      ContentRoot={pages.request.ExperiencesRoot}
      AnalyticsRoot={pages.request.ExperiencesAnalyticsRoot}
      Experience={pages.Experience}
      RequestExperience={pages.request.Experience}
      navigate={(href, replace, shallow) => {
        void router[replace ? 'replace' : 'push'](href, undefined, {
          shallow: shallow ?? false,
        });
      }}
    />
  );
}

function ReferenceBrowserRoot({
  environment,
  currentRouteKey,
  ContentRoot,
  AnalyticsRoot,
  Experience,
  RequestExperience,
  navigate,
  ...props
}: BoundNextjsRequestRootProps &
  Pick<ReferenceContextValue, 'environment' | 'Experience' | 'RequestExperience' | 'navigate'> & {
    currentRouteKey: string;
    ContentRoot: ComponentType<BoundNextjsRequestRootProps>;
    AnalyticsRoot: ComponentType<BoundNextjsRequestRootProps & { experienceId?: string }>;
  }) {
  const url = new URL(currentRouteKey, 'https://nextjs.invalid');
  const binding = previewBinding(environment, url);
  const previewKey = JSON.stringify(binding);
  const livePreview = useMemo(() => previewConfiguration(binding), [previewKey]);
  const [log] = useState(createAttemptLog);
  const serverOnly = url.searchParams.get('mode') === 'server-only';
  const Root = serverOnly ? AnalyticsRoot : ContentRoot;
  return (
    <Root
      {...props}
      key={previewKey ?? 'ordinary'}
      isPreview={Boolean(binding)}
      livePreview={livePreview}
      onStatesReady={log.onStatesReady}
      experienceId={routeIds(url.pathname, environment.experienceIds)[0]}
    >
      <ReferenceContext.Provider
        value={{
          environment,
          log,
          routeKey: currentRouteKey,
          serverOnly,
          navigate,
          Experience,
          RequestExperience,
        }}
      >
        <ConsentMirror />
        <ReferenceShell>{props.children}</ReferenceShell>
      </ReferenceContext.Provider>
    </Root>
  );
}

function ReferenceShell({ children }: { children: ReactNode }) {
  const { routeKey, log, serverOnly } = useReference();
  const url = new URL(routeKey, 'https://nextjs.invalid');
  const pages = url.pathname.startsWith('/pages');
  const pageTwo = url.pathname.endsWith('/page-two');
  const home = pages ? '/pages' : '/';
  const title = pageTwo ? 'Page Two' : 'Next SDK';
  function href(path: string) {
    const target = new URL(path, url);
    for (const key of [
      'userId',
      'preview_session_id',
      'preview_experience_id',
      'mode',
      'analytics',
    ]) {
      const value = url.searchParams.get(key);
      if (value !== null) target.searchParams.set(key, value);
    }
    return target.pathname + target.search;
  }
  useEffect(() => {
    document.title = `${title} – Contentful Experiences`;
    document.getElementById('app-main')?.focus();
  }, [title, routeKey]);
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        {[home, `${pages ? '/pages' : ''}/page-two`].map((path, index) => (
          <Link
            key={path}
            href={href(path)}
            prefetch={false}
            className={url.pathname === path ? 'active' : undefined}
            aria-current={url.pathname === path ? 'page' : undefined}
            data-testid={index ? 'link-page-two' : 'link-home'}
          >
            {index ? 'Page Two' : 'Home'}
          </Link>
        ))}
        <a href={pages ? '/pages/single-experience' : '/single-experience'}>Single Experience</a>
        <a href={href(pages ? '/' : '/pages')}>{pages ? 'App Router' : 'Pages Router'}</a>
        <a href={`${url.pathname}?mode=${serverOnly ? 'preserve-server' : 'server-only'}`}>
          {serverOnly ? 'Hybrid rendering' : 'Server-only rendering'}
        </a>
      </nav>
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Tracking">
          <TrackingLog log={log} />
        </aside>
        <main className="app-main" id="app-main" tabIndex={-1}>
          <header className="page-header" data-testid={pageTwo ? 'page-two-view' : 'home-view'}>
            <h1>{title}</h1>
            <p className="page-header__subtitle">
              Diagnostic Next.js {pages ? 'Pages' : 'App'} Router reference.{' '}
              {serverOnly
                ? 'Server-only content with optional browser analytics.'
                : 'Server content adopted by one browser owner.'}
            </p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
