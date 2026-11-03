import 'server-only';

import type { NextjsCookieReader } from '@contentful/experiences-nextjs/server';
import { consentCookies, consentDecision } from './reference';

export function readConsent(cookies: NextjsCookieReader) {
  const value = (name: string) => {
    const cookie = cookies.get(name);
    return typeof cookie === 'string' ? cookie : cookie?.value;
  };
  return {
    events: consentDecision(value(consentCookies.events)),
    persistence: consentDecision(value(consentCookies.persistence)),
  };
}
