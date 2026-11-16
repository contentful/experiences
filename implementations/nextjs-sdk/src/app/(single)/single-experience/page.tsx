import { singleAppExperiences } from '../../../single-experience-server';
import { SingleExperiencePage } from '../../../components/SingleExperiencePage';
import { ClientRequestRoot, ClientRequestExperience } from '../../../components/SingleExperience';
import { serializeNextjsRequestResult } from '@contentful/experiences-nextjs/app-router/server';
import { getServer } from '../../../config';

export const dynamic = 'force-dynamic';

export default async function SingleExperience() {
  const result = serializeNextjsRequestResult(
    await singleAppExperiences().request.loadExperience()
  );
  const { browser } = getServer();
  return (
    <ClientRequestRoot {...browser.web} isPreview={false} result={result}>
      <SingleExperiencePage>
        <ClientRequestExperience result={result} />
      </SingleExperiencePage>
    </ClientRequestRoot>
  );
}
