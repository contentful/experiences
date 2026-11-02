import { StrictMode, useLayoutEffect, useMemo, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useExperiencesActions } from '@contentful/experiences-react/client';
import { App, type PageIntent } from './App';
import { createAttemptLog } from './attempt-log';
import { ExperiencesRoot } from './experiences';
import { createPreviewInitializer, getPreviewBinding } from './preview';
import type { PublicEnvironment } from '../public-config';
import './theme.css';

declare global {
  interface Window {
    ENVIRONMENT: PublicEnvironment;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The React application root is missing.');
const log = createAttemptLog();
const environment = window.ENVIRONMENT;
const initialPagePayload = {};
const initialUrl = new URL(window.location.href);
function pageIntent(
  url: URL,
  cycle: number,
  personalization?: PageIntent['personalization']
): PageIntent {
  return { pathname: url.pathname, href: url.href, cycle, personalization };
}
const initialIntent = pageIntent(
  initialUrl,
  0,
  initialUrl.searchParams.get('userId') === 'charles'
    ? {
        events: [
          { type: 'identify', userId: 'charles', traits: { identified: true } },
          { type: 'page' },
        ],
      }
    : undefined
);

function ReferenceApp() {
  const [intent, setIntent] = useState(initialIntent);
  const url = new URL(intent.href);
  const previewBinding = useMemo(() => getPreviewBinding(environment, intent.href), [intent.href]);
  const previewKey = JSON.stringify(previewBinding);
  const livePreview = useMemo(() => createPreviewInitializer(previewBinding), [previewKey]);
  const isPreview = Boolean(previewBinding || url.searchParams.get('preview_session_id')?.trim());
  // Fixed runtime policy/session changes replace the owner; ordinary routes retain it.
  const ownerKey = `${isPreview}:${previewKey}`;
  function changeIntent(url: URL, personalization?: PageIntent['personalization']) {
    setIntent((previous) => pageIntent(url, previous.cycle + 1, personalization));
  }
  function navigate(url: URL, push: boolean) {
    if (push) window.history.pushState(null, '', url.pathname + url.search + url.hash);
    changeIntent(url);
    // The new route commits before focus, and document metadata precedes fetching.
    window.requestAnimationFrame(() => document.getElementById('app-main')?.focus());
  }
  useLayoutEffect(() => {
    const onPopState = () => navigate(new URL(window.location.href), false);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });
  function onNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || !['/', '/page-two'].includes(url.pathname)) return;
    event.preventDefault();
    if (url.href !== window.location.href) navigate(url, true);
  }
  return (
    <div onClick={onNavigation}>
      <ExperiencesRoot
        key={ownerKey}
        isPreview={isPreview}
        spaceId={environment.SPACE_ID}
        environmentId={environment.ENVIRONMENT_ID}
        locale={environment.LOCALE}
        delivery={{ accessToken: environment.CDA_TOKEN }}
        preview={
          environment.LIVE_PREVIEW
            ? {
                accessToken: environment.LIVE_PREVIEW.accessToken,
                host: environment.LIVE_PREVIEW.host,
              }
            : undefined
        }
        livePreview={livePreview}
        routeKey={url.pathname + url.search}
        initialPagePayload={initialPagePayload}
        onStatesReady={log.onStatesReady}
      >
        <RuntimeApp intent={intent} onIntent={changeIntent} />
      </ExperiencesRoot>
    </div>
  );
}

function RuntimeApp({
  intent,
  onIntent,
}: {
  intent: PageIntent;
  onIntent: (url: URL, personalization?: PageIntent['personalization']) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const { resetUser } = useExperiencesActions();
  function identify() {
    const url = new URL(window.location.href);
    url.searchParams.set('userId', 'charles');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    onIntent(url, {
      events: [{ type: 'identify', userId: 'charles', traits: { identified: true } }],
    });
  }
  function reset() {
    // Web immediately resumes discovery on reset. Remove old attribution and
    // release its manual registrations first, retaining the stable SDK root.
    flushSync(() => setHidden(true));
    resetUser();
    const url = new URL(window.location.href);
    url.searchParams.delete('userId');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    onIntent(url);
    setHidden(false);
  }
  function track() {
    onIntent(new URL(intent.href), {
      events: [{ type: 'track', event: 'reference_custom_action' }],
    });
  }
  return (
    <App
      {...{ intent, environment, log, hidden }}
      onIdentify={identify}
      onReset={reset}
      onTrack={track}
    />
  );
}

createRoot(root).render(
  <StrictMode>
    <ReferenceApp />
  </StrictMode>
);
// Web owns final hide/unload drains. Keep the root and attributed content alive
// for those drains and BFCache; deliberate in-document removal uses React cleanup.
