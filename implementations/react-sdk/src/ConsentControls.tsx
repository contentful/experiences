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
            <span className="control-panel__row-actions">
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
            </span>
          </Fragment>
        ))}
        <span className="control-panel__row-label">Visitor intent</span>
        <span className="control-panel__row-value" data-testid="identified-status">
          URL identify intent: {identified ? 'Yes' : 'No'}
        </span>
        <span className="control-panel__row-actions">
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
        </span>
        <span className="control-panel__row-label">Content</span>
        <span className="control-panel__row-value">{result?.status ?? '—'}</span>
        <span className="control-panel__row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="retry-content-button"
            disabled={!isLive || loading}
            onClick={() => void result?.retry()}
          >
            Retry content
          </button>
        </span>
        {intent.url.pathname === '/page-two' && (
          <>
            <span className="control-panel__row-label">Custom track</span>
            <span className="control-panel__row-value">reference_custom_action</span>
            <span className="control-panel__row-actions">
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
            </span>
          </>
        )}
        {isPreview && (
          <>
            <span className="control-panel__row-label">Live Preview</span>
            <span className="control-panel__row-value" role="status">
              {preview?.status ?? 'Initializing'}
            </span>
            <span className="control-panel__row-actions" />
          </>
        )}
        {preview?.error && (
          <>
            <span className="control-panel__row-label">Live Preview error</span>
            <span className="control-panel__row-value" role="alert">
              {preview.error.message}
            </span>
            <span className="control-panel__row-actions" />
          </>
        )}
        {error && (
          <>
            <span className="control-panel__row-label">SDK error</span>
            <span className="control-panel__row-value" role="alert">
              {error.message}
            </span>
            <span className="control-panel__row-actions" />
          </>
        )}
      </div>
      <p className="control-panel__note">
        The SDK owns consent, profile persistence and managed content. Identify and custom actions
        supply fresh XDA intent; Retry fetches content without new events. XDA currently evaluates
        these events without committing them.
      </p>
    </section>
  );
}
