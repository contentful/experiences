'use client';

import { useCallback, useState } from 'react';
import parse from 'html-react-parser';
import { useRouter } from 'next/router';
import type { PagesReferenceProps } from '../pages-server';
import {
  ClientExperienceRenderer,
  useExperiences,
  type ManagedExperienceResult,
  type OnExperienceNodeRoot,
} from '@contentful/experiences-nextjs/client';
import type { ContentSeed } from '../reference';
import { useReference } from './BrowserRoot';
import { browserRegistry } from './browser-registry';
import { ExperiencePresentation } from './ExperiencePresentation';
import { Utilities, ServerUtilities, type Personalization } from './Utilities';
import { pagesContentActionUrls } from './pages-content-action';
import { ManualServerViews } from './ManualServerViews';

export function ClientContentPage({ seeds }: { seeds: readonly ContentSeed[] }) {
  const { environment, routeKey, Experience, RequestExperience } = useReference();
  const pageTwo = new URL(routeKey, 'https://nextjs.invalid').pathname.endsWith('/page-two');
  const ids = pageTwo ? environment.experienceIds.slice(-1) : environment.experienceIds;
  const [intent, setIntent] = useState<{
    cycle: number;
    personalization?: Personalization;
    identified: boolean;
  }>({
    cycle: 0,
    identified: false,
  });
  const [hidden, setHidden] = useState(false);
  const primarySeed = seeds.find((seed) => seed.experience.experienceId === ids[0]);
  const render = (result: ManagedExperienceResult) => (
    <>
      <Utilities
        result={result}
        identifyIntent={intent.identified}
        onIntent={(personalization) =>
          setIntent((old) => ({
            cycle: old.cycle + 1,
            personalization,
            identified:
              old.identified ||
              personalization?.events?.some((event) => event.type === 'identify') === true,
          }))
        }
        onClearContent={() => setHidden(true)}
        onResume={() => {
          setIntent((old) => ({ cycle: old.cycle + 1, identified: false }));
          setHidden(false);
        }}
      />
      {!hidden && (
        <div
          className="sections-grid sections-grid--split"
          data-testid={pageTwo ? 'page-two-experiences' : undefined}
        >
          <section className="page-section">
            <header className="page-section__header">
              <h2>Experiences with automatic tracking defaults</h2>
              <p>
                Source-map attribution connects the rendered DOM to SDK-measured views, hovers and
                clicks.
              </p>
            </header>
            <div className="entry-grid entry-grid--experiences">
              <ManagedPresentation experienceId={ids[0]} result={result} />
              <ComparisonSequence
                ids={ids.slice(1)}
                seeds={seeds}
                fresh={intent.cycle !== 0}
                ready={terminal(result)}
              />
            </div>
          </section>
          <section className="page-section">
            <header className="page-section__header">
              <h2>Experiences for manual view registration</h2>
              <p>
                The first configured plan is reused twice in distinct containers. Automatic
                interactions are disabled; the SDK measures explicitly registered views.
              </p>
            </header>
            <div className="entry-grid entry-grid--experiences">
              {environment.experienceIds[0] === ids[0] ? (
                <Repeated result={result} experienceId={ids[0]} />
              ) : (
                <ComparisonSequence
                  ids={[environment.experienceIds[0]]}
                  seeds={seeds}
                  fresh={intent.cycle !== 0}
                  ready={terminal(result)}
                  manual
                />
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
  return intent.cycle === 0 && primarySeed && (primarySeed.plan || primarySeed.contentError) ? (
    <RequestExperience key={intent.cycle} result={primarySeed}>
      {render}
    </RequestExperience>
  ) : (
    <Experience
      key={intent.cycle}
      {...primarySeed?.experience}
      experienceId={ids[0]}
      personalization={intent.personalization}
    >
      {render}
    </Experience>
  );
}

function terminal(result: ManagedExperienceResult) {
  return result.status === 'success' || result.status === 'error';
}
function Repeated({
  result,
  experienceId,
}: {
  result: ManagedExperienceResult;
  experienceId: string;
}) {
  return (
    <>
      <ManagedPresentation result={result} experienceId={experienceId} manual />
      <ManagedPresentation result={result} experienceId={experienceId} manual repeated />
    </>
  );
}

// These are reference-only comparisons. Each later ID loads event-free after
// the prior result; repeated containers render the same plan without a fetch.
function ComparisonSequence({
  ids,
  seeds,
  ready,
  fresh = false,
  manual = false,
}: {
  ids: readonly string[];
  seeds: readonly ContentSeed[];
  ready: boolean;
  fresh?: boolean;
  manual?: boolean;
}) {
  const { Experience, RequestExperience } = useReference();
  const id = ids[0];
  const seed = seeds.find((value) => value.experience.experienceId === id);
  if (!ids.length || !ready) return null;
  const render = (result: ManagedExperienceResult) => (
    <>
      {manual ? (
        <Repeated result={result} experienceId={id} />
      ) : (
        <ManagedPresentation result={result} experienceId={id} />
      )}
      <ComparisonSequence ids={ids.slice(1)} seeds={seeds} fresh={fresh} ready={terminal(result)} />
    </>
  );
  return seed && !fresh ? (
    <RequestExperience result={seed}>{render}</RequestExperience>
  ) : (
    <Experience {...(seed?.experience ?? { experienceId: id, personalization: { events: [] } })}>
      {render}
    </Experience>
  );
}

export function ManagedPresentation({
  experienceId,
  result,
  manual = false,
  repeated = false,
}: {
  experienceId: string;
  result: Pick<ManagedExperienceResult, 'data' | 'error'>;
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
  const { data, error } = result;
  return (
    <ExperiencePresentation
      experienceId={experienceId}
      plan={data}
      error={error}
      repeated={repeated}
    >
      {data && (
        <ClientExperienceRenderer
          experience={data}
          config={browserRegistry}
          trackViews={manual ? false : undefined}
          trackHovers={manual ? false : undefined}
          trackClicks={manual ? false : undefined}
          onNodeRoot={manual ? registerView : undefined}
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

export function PagesContentPage({
  experiences,
  serverOnly,
  analytics,
  html,
  comparisons,
}: PagesReferenceProps) {
  const router = useRouter();
  async function update(routeKey: string, personalization?: Personalization) {
    const { internalHref, visibleHref } = pagesContentActionUrls(routeKey, personalization);
    const loaded = await router.replace(internalHref, visibleHref);
    if (!loaded) throw new Error('The server content request was canceled.');
  }
  if (serverOnly) {
    const content = analytics ? (
      <ManualServerViews html={html ?? ''} />
    ) : (
      <div>{parse(html ?? '')}</div>
    );
    return analytics ? (
      <ServerUtilities key={experiences.routeKey} update={update}>
        {content}
      </ServerUtilities>
    ) : (
      content
    );
  }
  return (
    <ClientContentPage key={experiences.routeKey} seeds={[experiences, ...(comparisons ?? [])]} />
  );
}
