'use client';

import { useMemo, useState } from 'react';
import type { AttemptLog } from './attempt-log';
import { ConsentControls } from './ConsentControls';
import { useComparisonContent } from './content-loader';
import { ExperiencePresentation } from './ExperiencePresentation';
import { useManagedExperience } from './experiences';
import type { OnIntent, PageIntent } from './Navigation';
import { PageShell } from './PageShell';

export function ContentPage({
  intent,
  onIntent,
  ids,
  manualId,
  log,
}: {
  intent: PageIntent;
  onIntent: OnIntent;
  ids: string[];
  manualId?: string;
  log: AttemptLog;
}) {
  const result = useManagedExperience({
    experienceId: ids[0],
    personalization: intent.personalization,
  });
  const remainingIds = useMemo(
    () => [...new Set([...ids, ...(manualId ? [manualId] : [])])].filter((id) => id !== ids[0]),
    [ids, manualId]
  );
  const comparisons = useComparisonContent(
    remainingIds,
    result.status === 'success' || result.status === 'error'
  );
  const [hidden, setHidden] = useState(false);
  function presentation(id: string, manual = false, repeated = false) {
    return (
      <ExperiencePresentation
        key={`${id}${repeated ? '-repeat' : ''}`}
        experienceId={id}
        result={id === ids[0] ? result : comparisons[id]}
        managed={id !== ids[0]}
        manual={manual}
        repeated={repeated}
      />
    );
  }
  return (
    <PageShell url={intent.url} log={log} loading={result.status === 'loading'}>
      <ConsentControls
        intent={intent}
        onIntent={onIntent}
        result={result}
        onClearContent={() => setHidden(true)}
      />
      {!hidden && (
        <div
          className="sections-grid sections-grid--split"
          data-testid={intent.url.pathname === '/page-two' ? 'page-two-experiences' : undefined}
        >
          <section className="page-section">
            <header className="page-section__header">
              <h2>Experiences with automatic tracking defaults</h2>
              <p>
                Standard rendering stamps source-map attribution on actual DOM roots. The shared Web
                SDK measures permitted views, hovers and clicks, subject to consent and profile
                availability.
              </p>
            </header>
            <div className="entry-grid entry-grid--experiences">
              {ids.map((id) => presentation(id))}
            </div>
          </section>
          <section className="page-section">
            <header className="page-section__header">
              <h2>Experiences for manual view registration</h2>
              <p>
                The first plan is reused twice with distinct DOM roots. Attribution is retained and
                automatic views, hovers and clicks are disabled. Each attributed root is registered
                for SDK-measured views through runtime context.
              </p>
            </header>
            <div className="entry-grid entry-grid--experiences">
              {manualId && presentation(manualId, true)}
              {manualId && presentation(manualId, true, true)}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
