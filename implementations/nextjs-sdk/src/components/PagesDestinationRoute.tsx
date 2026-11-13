import type { DestinationPagesProps } from '../destination-server';
import { DestinationPage } from './DestinationPage';
import { PagesDestinationExperience } from './SingleExperience';

// `_app` wraps configured results in the Pages request root, as for /pages/single-experience.
export function PagesDestinationRoute(props: DestinationPagesProps) {
  if ('notConfigured' in props)
    return (
      <DestinationPage router="pages" serverOnly={props.serverOnly}>
        {null}
      </DestinationPage>
    );
  return (
    <DestinationPage
      router="pages"
      destination={props.environment.destination}
      serverOnly={props.serverOnly}
    >
      <PagesDestinationExperience result={props.experiences} />
    </DestinationPage>
  );
}
