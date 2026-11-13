import 'server-only';

import { serializeRequestResult } from '@contentful/experiences-nextjs/app-router/server';
import { getServer } from '../config';
import { loadAppDestination } from '../destination-server';
import { DestinationPage } from './DestinationPage';
import { ClientDestinationExperience, ClientRequestRoot } from './SingleExperience';

// Route the outcome before rendering request components: a redirect calls Next
// redirect() and a missing Destination path/node calls notFound().
export async function DestinationAppRoute({ serverOnly }: { serverOnly: boolean }) {
  const { browser } = getServer();
  if (!browser.destination)
    return (
      <DestinationPage router="app" serverOnly={serverOnly}>
        {null}
      </DestinationPage>
    );
  const result = serializeRequestResult(await loadAppDestination(browser.destination));
  return (
    <ClientRequestRoot {...browser.web} result={result}>
      <DestinationPage router="app" destination={browser.destination} serverOnly={serverOnly}>
        <ClientDestinationExperience result={result} />
      </DestinationPage>
    </ClientRequestRoot>
  );
}
