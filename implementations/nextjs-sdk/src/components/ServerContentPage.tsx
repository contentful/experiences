import { ServerPresentations } from './ServerPresentations';
import { loadServerPage, contentSeeds } from '../server-loader';
import { ClientContentPage } from './ClientContentPage';
import { ServerUtilities } from './Utilities';
import { updateServerContent } from '../app/(experiences)/actions';

export async function ServerContentPage({ title }: { title: string }) {
  const { result, browserResult, comparisons, serverOnly, analytics, browser } =
    await loadServerPage();
  const all = [result, ...comparisons];
  if (!serverOnly)
    return <ClientContentPage key={result.routeKey} seeds={contentSeeds(all, browserResult)} />;
  const content = (
    <ServerPresentations
      all={all}
      routeKey={result.routeKey}
      ids={browser.experienceIds}
      title={analytics ? undefined : title}
    />
  );
  return analytics ? (
    <ServerUtilities key={result.routeKey} update={updateServerContent}>
      {content}
    </ServerUtilities>
  ) : (
    content
  );
}
