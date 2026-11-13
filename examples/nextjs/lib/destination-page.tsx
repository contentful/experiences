import { notFound } from 'next/navigation';

import { NotFoundError } from '@contentful/experiences-nextjs/server';

import { ConsentPanel } from '@/components/ConsentPanel';
import { binding, Experience, ExperiencesRoot } from '@/lib/experience-server';

export { flag, type SearchParams } from './page-options';

/** One memoized result supplies this page's browser owner and presentation. */
export async function renderDestinationPage() {
  const result = await binding.request.loadExperience();
  if (result.error instanceof NotFoundError) notFound();
  // The bound components handle native redirects and serialize the full result.
  return (
    <ExperiencesRoot locale={result.experience.locale}>
      {result.contentError && <p role="alert">{result.contentError}</p>}
      <Experience />
      <ConsentPanel />
    </ExperiencesRoot>
  );
}
