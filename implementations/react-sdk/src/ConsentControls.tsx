import {
  useConsentState,
  useExperiencesActions,
  useExperiencesContext,
  usePersistenceConsentState,
  usePreviewState,
} from '@contentful/experiences-react/client';

function consentLabel(value: boolean | undefined) {
  return value === undefined ? 'Undecided' : value ? 'Granted' : 'Denied';
}

export function ConsentControls({
  identified,
  onIdentify,
  onReset,
  onRetry,
  onTrack,
  loading,
  actionPending,
}: {
  identified: boolean;
  onIdentify: () => void;
  onReset: () => void;
  onRetry: () => void;
  onTrack?: () => void;
  loading: boolean;
  actionPending: boolean;
}) {
  const events = useConsentState();
  const persistence = usePersistenceConsentState();
  const { setConsent } = useExperiencesActions();
  const { error, isLive, sdk } = useExperiencesContext();
  const preview = usePreviewState();
  const isPreview = isLive && sdk.isPreview;

  return (
    <section className="control-panel" aria-label="Utilities">
      <h2 className="control-panel__title">Utilities</h2>
      <div className="control-panel__fields">
        <span className="control-panel__row-label">Event consent</span>
        <span className="control-panel__row-value" data-testid="consent-status">
          {consentLabel(events)}
        </span>
        <button
          type="button"
          className={`btn btn--sm ${events ? 'btn--danger' : 'btn--secondary'}`}
          data-testid={events ? 'unconsent-button' : 'consent-button'}
          disabled={!isLive}
          onClick={() => setConsent({ events: events !== true })}
        >
          {events ? 'Revoke' : 'Grant'}
        </button>
        <span className="control-panel__row-label">Persistence consent</span>
        <span className="control-panel__row-value" data-testid="persistence-consent-status">
          {consentLabel(persistence)}
        </span>
        <button
          type="button"
          className={`btn btn--sm ${persistence ? 'btn--danger' : 'btn--secondary'}`}
          data-testid={persistence ? 'persistence-unconsent-button' : 'persistence-consent-button'}
          disabled={!isLive}
          onClick={() => setConsent({ persistence: persistence !== true })}
        >
          {persistence ? 'Revoke' : 'Grant'}
        </button>
      </div>
      <div className="control-panel__actions">
        <span data-testid="identified-status">
          URL identify intent: {identified ? 'Yes' : 'No'}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="identify-button"
          disabled={!isLive || isPreview || identified || actionPending}
          onClick={onIdentify}
        >
          Identify
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="reset-button"
          disabled={!isLive}
          onClick={onReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          data-testid="retry-content-button"
          disabled={!isLive || loading}
          onClick={onRetry}
        >
          Retry content
        </button>
        {onTrack && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="track-conversion-button"
            disabled={!isLive || isPreview || actionPending}
            onClick={onTrack}
          >
            CUSTOM TRACK
          </button>
        )}
      </div>
      {actionPending && <p role="status">Waiting for current content before the visitor action…</p>}
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
