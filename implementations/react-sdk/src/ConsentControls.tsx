'use client';

import {
  useConsentState,
  useExperiencesActions,
  useExperiencesContext,
  usePersistenceConsentState,
  usePreviewState,
  type ManagedExperienceResult,
} from '@contentful/experiences-react/client';

import { Fragment } from 'react';
import { flushSync } from 'react-dom';
import type { OnIntent, PageIntent } from './Navigation';

function consentLabel(value: boolean | undefined) {
  return value === undefined ? 'Undecided' : value ? 'Granted' : 'Denied';
}

export function ConsentControls({
  intent,
  onIntent,
  result,
  onClearContent,
}: {
  intent: PageIntent;
  onIntent: OnIntent;
  result?: ManagedExperienceResult;
  onClearContent?: () => void;
}) {
  const events = useConsentState();
  const persistence = usePersistenceConsentState();
  const { setConsent, resetUser } = useExperiencesActions();
  const { error, isLive, sdk } = useExperiencesContext();
  const preview = usePreviewState();
  const isPreview = isLive && sdk.isPreview;

  const identified = intent.url.searchParams.get('userId') === 'charles';
  const loading = result?.status === 'loading';
  function identify() {
    const url = new URL(intent.url);
    url.searchParams.set('userId', 'charles');
    onIntent(url, {
      events: [{ type: 'identify', userId: 'charles', traits: { identified: true } }],
    });
  }
  function reset() {
    // Remove attributed DOM and manual registrations before SDK discovery resumes.
    flushSync(() => onClearContent?.());
    resetUser();
    const url = new URL(intent.url);
    url.searchParams.delete('userId');
    onIntent(url);
  }
  return (
    <section className="control-panel" aria-label="Utilities">
      <h2 className="control-panel__title">Utilities</h2>
      <div className="control-panel__fields">
        {[
          { name: 'events', label: 'Event consent', value: events, testId: 'consent' },
          {
            name: 'persistence',
            label: 'Persistence consent',
            value: persistence,
            testId: 'persistence-consent',
          },
        ].map(({ name, label, value, testId }) => (
          <Fragment key={name}>
            <span className="control-panel__row-label">{label}</span>
            <span className="control-panel__row-value" data-testid={`${testId}-status`}>
              {consentLabel(value)}
            </span>
            <button
              type="button"
              className={`btn btn--sm ${value ? 'btn--danger' : 'btn--secondary'}`}
              data-testid={
                value
                  ? name === 'events'
                    ? 'unconsent-button'
                    : 'persistence-unconsent-button'
                  : `${testId}-button`
              }
              disabled={!isLive}
              onClick={() => setConsent({ [name]: value !== true })}
            >
              {value ? 'Revoke' : 'Grant'}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="control-panel__actions">
        <span data-testid="identified-status">
          URL identify intent: {identified ? 'Yes' : 'No'}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="identify-button"
          disabled={!isLive || isPreview || identified || loading || result?.status === 'idle'}
          onClick={identify}
        >
          Identify
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="reset-button"
          disabled={!isLive}
          onClick={reset}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="retry-content-button"
          disabled={!isLive || loading}
          onClick={() => void result?.retry()}
        >
          Retry content
        </button>
        {intent.url.pathname === '/page-two' && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="track-conversion-button"
            disabled={!isLive || isPreview || loading || result?.status === 'idle'}
            onClick={() =>
              onIntent(intent.url, {
                events: [{ type: 'track', event: 'reference_custom_action' }],
              })
            }
          >
            CUSTOM TRACK
          </button>
        )}
      </div>
      {isPreview && <p role="status">Preview: {preview?.status ?? 'Initializing'}</p>}
      {preview?.error && <p role="alert">{preview.error.message}</p>}
      {error && <p role="alert">{error.message}</p>}
      <p className="control-panel__note">
        The SDK owns consent, profile persistence and managed content. Identify and custom actions
        supply fresh XDA intent; Retry fetches content without new events. XDA currently evaluates
        these events without committing them.
      </p>
    </section>
  );
}
