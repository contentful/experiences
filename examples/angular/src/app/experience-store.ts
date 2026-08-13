import { Injectable, REQUEST_CONTEXT, TransferState, inject, makeStateKey } from '@angular/core';

import { type ExperienceRouteData, isExperienceRouteData } from './lib/experience-route-data.js';

const EXPERIENCE_KEY = makeStateKey<ExperienceRouteData | null>('cf.experience');

/**
 * Bridges the server-resolved render plan into the component tree.
 *
 * On the server the data arrives via `REQUEST_CONTEXT` (see `src/server.ts`) and
 * is written into `TransferState`; in the browser it is read straight back out.
 * Deliberately *not* an Angular route resolver: resolvers also run during
 * client-side navigation, which would put the CDA/CPA tokens in the bundle.
 */
@Injectable({ providedIn: 'root' })
export class ExperienceStore {
  readonly data: ExperienceRouteData | null;

  constructor() {
    const transferState = inject(TransferState);
    const requestContext = inject(REQUEST_CONTEXT, { optional: true });

    if (isExperienceRouteData(requestContext)) {
      transferState.set(EXPERIENCE_KEY, requestContext);
      this.data = requestContext;
    } else {
      this.data = transferState.get(EXPERIENCE_KEY, null);
    }
  }
}
