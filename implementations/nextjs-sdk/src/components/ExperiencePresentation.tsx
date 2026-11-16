import type { PortableRenderPlan } from '@contentful/experiences-web';
import type { ReactNode } from 'react';

export function ExperiencePresentation({
  experienceId,
  plan,
  error,
  repeated = false,
  children,
}: {
  experienceId: string;
  plan?: PortableRenderPlan;
  error?: unknown;
  repeated?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="experience-presentation"
      aria-label={`Experience ${experienceId}${repeated ? ' repeated' : ''}`}
    >
      <header className="experience-presentation__header">
        <code>{experienceId}</code>
        {repeated && <span className="entry-card__badge">Repeated plan</span>}
      </header>
      {Boolean(error) && (
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
          {children}
        </>
      ) : !error ? (
        <p role="status" className="page-loading">
          Loading Experience…
        </p>
      ) : null}
    </section>
  );
}
