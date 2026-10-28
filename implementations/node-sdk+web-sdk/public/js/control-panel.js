// Reference app: explicit actions are supplied by route orchestration. SDK observables are
// authoritative; updates neither fetch content nor send page events.
export function createControlPanel(sdk, { onIdentify, onReset, onRetry }) {
  const find = (name) => document.querySelector(`[data-testid="${name}"]`);
  const grant = find('consent-button');
  const revoke = find('unconsent-button');
  const identify = find('identify-button');
  const reset = find('reset-button');
  const retry = find('retry-content-button');
  let active = false;
  const consentLabel = (value) => (value === true ? 'Yes' : value === false ? 'No' : 'Undecided');

  // Consumer integration: mirror effective SDK decisions one way for the next
  // server request. Never use these cookies as browser constructor defaults or
  // access the SDK's LocalStorage keys. Undefined removes only the app mirror.
  function mirror(name, value) {
    const encoded = value === true ? 'granted' : value === false ? 'denied' : '';
    const age = typeof value === 'boolean' ? 365 * 24 * 60 * 60 : 0;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encoded}; Path=/; SameSite=Lax; Max-Age=${age}${secure}`;
  }

  function updateButtons() {
    grant.disabled =
      !active ||
      (sdk.states.consent.current === true && sdk.states.persistenceConsent.current === true);
    revoke.disabled =
      !active ||
      (sdk.states.consent.current === false && sdk.states.persistenceConsent.current === false);
    const identified = new URL(location.href).searchParams.get('userId') === 'charles';
    find('identified-status').textContent = identified ? 'Yes' : 'No';
    identify.disabled = !active || sdk.isPreview || identified;
    reset.disabled = !active;
    retry.disabled = !active;
  }

  const subscriptions = [
    sdk.states.consent.subscribe((value) => {
      mirror('experiences-hybrid-event-consent', value);
      find('consent-status').textContent = consentLabel(value);
      updateButtons();
    }),
    sdk.states.persistenceConsent.subscribe((value) => {
      mirror('experiences-hybrid-persistence-consent', value);
      find('persistence-consent-status').textContent = consentLabel(value);
      updateButtons();
    }),
    sdk.states.profile.subscribe((profile) => {
      // No profile payload or audience/identification claim belongs in this UI.
      find('profile-status').textContent = profile?.id ? 'Available' : 'Not available';
    }),
  ];
  const onGrant = () => sdk.consent(true);
  const onRevoke = () => sdk.consent(false);

  return {
    activate() {
      active = true;
      grant.addEventListener('click', onGrant);
      revoke.addEventListener('click', onRevoke);
      identify.addEventListener('click', onIdentify);
      reset.addEventListener('click', onReset);
      retry.addEventListener('click', onRetry);
      updateButtons();
    },
    refresh: updateButtons,
    dispose() {
      active = false;
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      grant.removeEventListener('click', onGrant);
      revoke.removeEventListener('click', onRevoke);
      identify.removeEventListener('click', onIdentify);
      reset.removeEventListener('click', onReset);
      retry.removeEventListener('click', onRetry);
      updateButtons();
    },
  };
}
