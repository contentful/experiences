import { ServerExperienceRenderer } from '@contentful/experiences-nextjs/server';
import { experienceConfig } from './ExperienceContent';
import { ExperiencePresentation } from './ExperiencePresentation';
import type { ServerContent } from '../server-reference';

export function ServerPresentations({
  all,
  routeKey,
  ids,
  title,
}: {
  all: readonly ServerContent[];
  routeKey: string;
  ids: readonly string[];
  title?: string;
}) {
  const displayIds = routeKey.split('?')[0].endsWith('/page-two') ? ids.slice(-1) : ids;
  const contents = all.filter((value) => displayIds.includes(value.experienceId));
  const repeated = all.find((value) => value.experienceId === ids[0]);
  return (
    <div>
      {title && (
        <header className="page-header">
          <h1>{title}</h1>
          <p className="page-header__subtitle">Contentful Experiences rendered on the server.</p>
        </header>
      )}
      <div className="sections-grid sections-grid--split">
        <section className="page-section">
          <header className="page-section__header">
            <h2>Server-rendered Experiences</h2>
            <p>Content, named slots and Rich Text from the delivered plans.</p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {contents.map((content) => (
              <ServerPresentation key={content.experienceId} {...content} />
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
                <ServerPresentation {...repeated} />
                <ServerPresentation {...repeated} repeated />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ServerPresentation(props: ServerContent & { repeated?: boolean }) {
  return (
    <ExperiencePresentation {...props}>
      {props.plan && (
        <ServerExperienceRenderer
          experience={props.plan}
          config={experienceConfig}
          renderUnknown={({ componentId }) => (
            <p role="alert" className="placeholder-card">
              No component registered for {componentId}.
            </p>
          )}
          renderError={({ componentId }) => (
            <p role="alert" className="placeholder-card">
              Could not render {componentId}.
            </p>
          )}
        />
      )}
    </ExperiencePresentation>
  );
}
