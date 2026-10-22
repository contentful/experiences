export function createControlPanel(sdk, { onIdentify, onReset }) {
  const find = (name) => document.querySelector(`[data-testid="${name}"]`);
  const consentLabel = (value) => (value === true ? 'Yes' : value === false ? 'No' : 'Undecided');

  function update() {
    if (!find('consent-status')) return;
    const events = sdk.states.consent.current;
    const persistence = sdk.states.persistenceConsent.current;
    const identifyRequested = new URL(location.href).searchParams.get('userId') === 'charles';
    find('consent-status').textContent = consentLabel(events);
    find('persistence-consent-status').textContent = consentLabel(persistence);
    find('identified-status').textContent = identifyRequested ? 'Yes' : 'No';
    find('consent-button').disabled = events === true && persistence === true;
    find('unconsent-button').disabled = events === false && persistence === false;
    find('identify-button').disabled = identifyRequested;
    find('reset-button').disabled = false;
  }

  // Consent subscriptions update only Utilities; content changes are explicit actions.
  const subscriptions = [
    sdk.states.consent.subscribe(update),
    sdk.states.persistenceConsent.subscribe(update),
  ];
  return {
    wire() {
      find('consent-button').addEventListener('click', () => sdk.consent(true));
      find('unconsent-button').addEventListener('click', () => sdk.consent(false));
      find('identify-button').addEventListener('click', onIdentify);
      find('reset-button').addEventListener('click', onReset);
      update();
    },
    dispose() {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    },
  };
}
