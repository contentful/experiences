import {
  useConsentState,
  useExperiencesActions,
  useExperiencesContext,
  usePersistenceConsentState,
} from '@contentful/experiences-react/client';

function consentLabel(value: boolean | undefined) {
  return value === undefined ? 'Undecided' : value ? 'Granted' : 'Denied';
}

export function ConsentControls() {
  const events = useConsentState();
  const persistence = usePersistenceConsentState();
  const { setConsent } = useExperiencesActions();
  const { error, isLive } = useExperiencesContext();

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
      {error && <p role="alert">{error.message}</p>}
      <p className="control-panel__note">
        The SDK owns consent and profile persistence. Content uses the application-owned free fetch
        path; changing consent does not reload content or initialize a visitor profile.
      </p>
    </section>
  );
}
