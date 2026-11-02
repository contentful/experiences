import { ServerExperienceRenderer } from '@contentful/experiences-nextjs/server';
import { experienceConfig } from './ExperienceContent';
import type { ServerContent } from '../server-loader';

export function ExperiencePresentation({
  experienceId,
  plan,
  error,
  repeated = false,
}: ServerContent & { repeated?: boolean }) {
  return (
    <section
      className="experience-presentation"
      aria-label={`Experience ${experienceId}${repeated ? ' repeated' : ''}`}
    >
      <header className="experience-presentation__header">
        <code>{experienceId}</code>
        {repeated && <span className="entry-card__badge">Repeated plan</span>}
      </header>
      {error && (
        <p role="alert" className="placeholder-card">
          This Experience could not be loaded.
        </p>
      )}
      {plan ? (
        <>
          {plan.diagnostics.length > 0 && (
            <p role="status" className="placeholder-card">
              Some content could not be resolved.
            </p>
          )}
          {!!plan.deliveryDiagnostics?.length && (
            <p role="status" className="placeholder-card">
              Some delivered content may be incomplete.
            </p>
          )}
          {!plan.nodes.length && (
            <p className="placeholder-card">The delivered plan has no renderable nodes.</p>
          )}
          <ServerExperienceRenderer
            experience={plan}
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
        </>
      ) : !error ? (
        <p className="placeholder-card">No content was returned for this Experience.</p>
      ) : null}
    </section>
  );
}
