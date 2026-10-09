import { Injectable, REQUEST_CONTEXT, TransferState, inject, makeStateKey } from '@angular/core';

import { type ConsentConfig, isConsentConfig } from './lib/consent-config.js';

const CONSENT_KEY = makeStateKey<ConsentConfig | null>('cf.consent');

/**
 * Relays the consent panel's credentials from the server to the browser.
 *
 * Same shape as `ExperienceStore`: on the server the value arrives via
 * `REQUEST_CONTEXT` and is written into `TransferState`; in the browser it is
 * read straight back out.
 */
@Injectable({ providedIn: 'root' })
export class ConsentStore {
  readonly config: ConsentConfig | null;

  constructor() {
    const transferState = inject(TransferState);
    const requestContext = inject(REQUEST_CONTEXT, { optional: true });
    const fromServer =
      typeof requestContext === 'object' && requestContext !== null && 'consent' in requestContext
        ? (requestContext as { consent: unknown }).consent
        : undefined;

    if (isConsentConfig(fromServer)) {
      transferState.set(CONSENT_KEY, fromServer);
      this.config = fromServer;
    } else {
      this.config = transferState.get(CONSENT_KEY, null);
    }
  }
}
