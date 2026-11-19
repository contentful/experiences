'use client';

import {
  useExperiences,
  type ComponentErrorProps,
  type MissingComponentProps,
  type OnExperienceNodeRoot,
} from '@contentful/experiences-react/client';
import { useCallback } from 'react';
import type { ContentResult } from './content-loader';
import { Experience, ExperienceRenderer } from './experiences';

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

export function ExperiencePresentation({
  experienceId,
  result,
  managed = false,
  manual = false,
  repeated = false,
}: {
  experienceId: string;
  result?: ContentResult;
  managed?: boolean;
  manual?: boolean;
  repeated?: boolean;
}) {
  const sdk = useExperiences();
  const registerView = useCallback<OnExperienceNodeRoot>(
    ({ element, data }) => {
      if (!data) return;
      sdk.tracking.enableElement('views', element, { data });
      return () => sdk.tracking.clearElement('views', element);
    },
    [sdk]
  );
  function present({ data, error }: ContentResult) {
    return (
      <>
        {error && (
          <p role="alert" className="placeholder-card">
            {error.message}
          </p>
        )}
        {data ? (
          <>
            {data.diagnostics?.length ? (
              <div role="status" className="placeholder-card">
                <strong>Content diagnostics</strong>
                <ul>
                  {data.diagnostics.map((diagnostic, index) => (
                    <li key={index}>{diagnostic.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.deliveryDiagnostics?.length ? (
              <p role="status" className="placeholder-card">
                Some Experience content may be incomplete.
              </p>
            ) : null}
            {!data.nodes.length && (
              <p className="placeholder-card">The delivered plan has no renderable nodes.</p>
            )}
            <ExperienceRenderer
              experience={data}
              trackViews={manual ? false : undefined}
              trackHovers={manual ? false : undefined}
              trackClicks={manual ? false : undefined}
              onNodeRoot={manual ? registerView : undefined}
              renderUnknown={UnknownComponent}
              renderError={RenderError}
            />
          </>
        ) : (
          !error && (
            <p role="status" className="page-loading">
              Loading Experience…
            </p>
          )
        )}
      </>
    );
  }
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
      ) : managed ? (
        <Experience
          experienceId={experienceId}
          initialPlan={result.data}
          initialError={result.error}
          personalization={{ events: [] }}
        >
          {present}
        </Experience>
      ) : (
        present(result)
      )}
    </section>
  );
}
