import {
  ServerExperienceRenderer,
  type PortableRenderNode,
  type PortableRenderPlan,
} from '@contentful/experiences-nextjs/server';
import { experienceConfig } from './ExperienceContent';
import { ExperiencePresentation } from './ExperiencePresentation';
import type { ServerContent } from '../server-reference';
import { ManualServerViews } from './ManualServerViews';

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
  const content = (
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
            <h2>Experiences with automatic tracking defaults</h2>
            <p>Server-rendered content with SDK-measured views, hovers and clicks.</p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {contents.map((content) => (
              <ServerPresentation key={content.experienceId} {...content} />
            ))}
          </div>
        </section>
        <section className="page-section" data-reference-manual-views>
          <header className="page-section__header">
            <h2>Experiences for manual view registration</h2>
            <p>
              The first configured plan is reused twice in distinct containers. Automatic
              interactions are disabled; the SDK measures explicitly registered views.
            </p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {repeated && (
              <>
                <ServerPresentation {...repeated} manual />
                <ServerPresentation {...repeated} manual repeated />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
  const url = new URL(routeKey, 'https://nextjs.invalid');
  // Pages serializes this subtree to static HTML and registers after insertion.
  // App also uses this boundary for replacement subtrees returned by Actions.
  return url.pathname.startsWith('/pages') || url.searchParams.get('analytics') === 'off' ? (
    content
  ) : (
    <ManualServerViews>{content}</ManualServerViews>
  );
}

// Match the browser registry's fragment-root click policy without changing the
// shared server registry or the source plan reused by repeated presentations.
function presentationPlan(plan: PortableRenderPlan): PortableRenderPlan {
  function nodeWithClickability(node: PortableRenderNode): PortableRenderNode {
    return {
      ...node,
      props: node.attribution?.roots.some((scope) => scope.entityKind === 'ExperienceFragment')
        ? {
            ...node.props,
            content: { ...node.props.content, 'data-ctfl-clickable': true },
          }
        : node.props,
      slots: Object.fromEntries(
        Object.entries(node.slots).map(([name, nodes]) => [name, nodes.map(nodeWithClickability)])
      ),
    };
  }
  return { ...plan, nodes: plan.nodes.map(nodeWithClickability) };
}

function ServerPresentation(props: ServerContent & { repeated?: boolean; manual?: boolean }) {
  return (
    <ExperiencePresentation {...props}>
      {props.plan && (
        <ServerExperienceRenderer
          experience={presentationPlan(props.plan)}
          config={experienceConfig}
          trackViews={props.manual ? false : undefined}
          trackHovers={props.manual ? false : undefined}
          trackClicks={props.manual ? false : undefined}
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
