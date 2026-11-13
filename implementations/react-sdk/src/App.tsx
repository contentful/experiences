'use client';

import { useMemo } from 'react';
import type { PublicEnvironment } from '../public-config';
import type { AttemptLog } from './attempt-log';
import { ConsentControls } from './ConsentControls';
import { ContentPage } from './ContentPage';
import { DestinationPage } from './DestinationPage';
import { ExperiencesRoot } from './experiences';
import { useNavigation } from './Navigation';
import { PageShell } from './PageShell';
import { createPreviewConfiguration } from './preview';
import { DESTINATION_NODE_ROUTE, destinationPathForRoute } from './routes';

const initialPagePayload = {};

export function App({ environment, log }: { environment: PublicEnvironment; log: AttemptLog }) {
  const { intent, onIntent, onNavigation } = useNavigation();
  const { url } = intent;
  const preview = useMemo(() => createPreviewConfiguration(environment), [environment]);
  const ids = useMemo(
    () =>
      url.pathname === '/' ? environment.EXPERIENCE_IDS : environment.EXPERIENCE_IDS.slice(-1),
    [environment, url.pathname]
  );
  const knownRoute = ['/', '/page-two'].includes(url.pathname);
  const destinationRoute =
    url.pathname === DESTINATION_NODE_ROUTE || destinationPathForRoute(url.pathname) !== undefined;
  return (
    <div onClick={onNavigation}>
      <ExperiencesRoot
        spaceId={environment.SPACE_ID}
        environmentId={environment.ENVIRONMENT_ID}
        locale={environment.LOCALE}
        delivery={{ accessToken: environment.CDA_TOKEN }}
        preview={preview}
        routeKey={url.pathname + url.search}
        initialPagePayload={initialPagePayload}
        onStatesReady={log.onStatesReady}
      >
        {destinationRoute ? (
          <DestinationPage
            key={intent.cycle}
            intent={intent}
            onIntent={onIntent}
            destination={environment.DESTINATION}
            log={log}
          />
        ) : knownRoute && ids.length ? (
          <ContentPage
            key={intent.cycle}
            intent={intent}
            onIntent={onIntent}
            ids={ids}
            manualId={environment.EXPERIENCE_IDS[0]}
            destination={environment.DESTINATION}
            log={log}
          />
        ) : (
          <PageShell url={url} log={log} destination={environment.DESTINATION}>
            {knownRoute && <ConsentControls intent={intent} onIntent={onIntent} />}
          </PageShell>
        )}
      </ExperiencesRoot>
    </div>
  );
}
