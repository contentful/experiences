import { test, type Page, type Request } from '@playwright/test';
import { missingLiveConfiguration, type AppName } from '../live-config';

/** Skip the whole spec, with a clear reason, when the app's live configuration is missing. */
export function requireLive(app: AppName): void {
  const reason = missingLiveConfiguration(app);
  test.skip(reason !== undefined, reason);
}

export interface ObservedRequest {
  readonly kind: 'xda' | 'personalization' | 'analytics';
  readonly url: string;
  readonly eventTypes: readonly string[];
}

function eventTypes(request: Request): string[] {
  const body = request.postData();
  if (!body) return [];
  try {
    const parsed = JSON.parse(body) as {
      events?: { type?: string }[];
      extensions?: { personalization?: { events?: { type?: string }[] } };
    };
    const events = parsed.extensions?.personalization?.events ?? parsed.events ?? [];
    return events.map((event) => String(event.type));
  } catch {
    return [];
  }
}

/**
 * Records outgoing Delivery (XDA), Personalization and Analytics requests from the
 * browser. Bodies are inspected only for event types; nothing is logged.
 */
export function observeRequests(page: Page): ObservedRequest[] {
  const observed: ObservedRequest[] = [];
  page.on('request', (request) => {
    const url = request.url();
    const kind = /xdn\.contentful\.com|\/api\/delivery\//.test(url)
      ? 'xda'
      : /experience\.ninetailed\.co/.test(url)
        ? 'personalization'
        : /insights\.ninetailed\.co/.test(url)
          ? 'analytics'
          : undefined;
    if (kind) observed.push({ kind, url, eventTypes: eventTypes(request) });
  });
  return observed;
}

/** Every page event the browser sent, through XDA fetches or Personalization replay. */
export const pageEvents = (observed: readonly ObservedRequest[]) =>
  observed.flatMap((request) =>
    request.eventTypes.filter((type) => type === 'page').map(() => request)
  );

/** Let in-flight requests (including queued replay) settle before counting. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);
}
