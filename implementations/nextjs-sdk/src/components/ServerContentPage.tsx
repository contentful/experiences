import { ExperiencePresentation } from './ExperiencePresentation';
import { loadServerPage } from '../server-loader';

export type PageSearchParams = Record<string, string | string[] | undefined>;

export async function ServerContentPage({
  pathname,
  title,
  searchParams,
}: {
  pathname: string;
  title: string;
  searchParams: PageSearchParams;
}) {
  const { contents, repeated } = await loadServerPage(pathname, searchParams);
  return (
    <main className="app-main" id="app-main">
      <header className="page-header">
        <h1>{title}</h1>
        <p className="page-header__subtitle">Contentful Experiences rendered on the server.</p>
      </header>
      <div className="sections-grid sections-grid--split">
        <section className="page-section">
          <header className="page-section__header">
            <h2>Server-rendered Experiences</h2>
            <p>Content, named slots and Rich Text from the delivered plans.</p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {contents.map((content) => (
              <ExperiencePresentation key={content.experienceId} {...content} />
            ))}
          </div>
        </section>
        <section className="page-section">
          <header className="page-section__header">
            <h2>Repeated presentations</h2>
            <p>The first configured plan is reused in separate attributed containers.</p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {repeated && (
              <>
                <ExperiencePresentation {...repeated} />
                <ExperiencePresentation {...repeated} repeated />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
