import {
  ExperienceRenderer,
  type ComponentErrorProps,
  type MissingComponentProps,
  type PortableRenderPlan,
} from '@contentful/experiences-react/client';

import type { ContentResult } from './content-loader';
import { experienceConfig } from './experience-config';

function UnknownComponent({ componentId, nodeId }: MissingComponentProps) {
  return (
    <p role="alert" className="placeholder-card">
      No component registered for {componentId}
      {nodeId ? ` (node ${nodeId})` : ''}.
    </p>
  );
}

function RenderError({ componentId, nodeId, message }: ComponentErrorProps) {
  return (
    <p role="alert" className="placeholder-card">
      Could not render {componentId}
      {nodeId ? ` (node ${nodeId})` : ''}: {message ?? 'Unknown render error.'}
    </p>
  );
}

function PlanPresentation({ plan, manual }: { plan: PortableRenderPlan; manual: boolean }) {
  return (
    <>
      {plan.diagnostics?.length ? (
        <div role="status" className="placeholder-card">
          <strong>Content diagnostics</strong>
          <ul>
            {plan.diagnostics.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!plan.nodes.length && (
        <p className="placeholder-card">The delivered plan has no renderable nodes.</p>
      )}
      <ExperienceRenderer
        experience={plan}
        config={experienceConfig}
        trackViews={manual ? false : undefined}
        trackHovers={manual ? false : undefined}
        trackClicks={manual ? false : undefined}
        renderUnknown={UnknownComponent}
        renderError={RenderError}
      />
    </>
  );
}

export function ExperiencePresentation({
  experienceId,
  result,
  manual = false,
  repeated = false,
}: {
  experienceId: string;
  result?: ContentResult;
  manual?: boolean;
  repeated?: boolean;
}) {
  return (
    <section
      className="experience-presentation"
      aria-label={`${manual ? 'Manual' : 'Automatic'} Experience ${experienceId}`}
    >
      <header className="experience-presentation__header">
        <code>{experienceId}</code>
        {repeated && <span className="entry-card__badge">Repeated plan</span>}
      </header>
      {!result ? (
        <p role="status" className="page-loading">
          Loading Experience…
        </p>
      ) : result.error !== undefined ? (
        <p role="alert" className="placeholder-card">
          {result.error}
        </p>
      ) : (
        <PlanPresentation plan={result.plan} manual={manual} />
      )}
    </section>
  );
}
