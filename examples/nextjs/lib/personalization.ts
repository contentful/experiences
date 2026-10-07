import 'server-only';

import { EventBuilder } from '@contentful/experiences-react';

const eventBuilder = new EventBuilder({
  channel: 'server',
  library: { name: 'experiences-nextjs-example', version: '0.0.0' },
});

// XDA takes the visitor's location from the event, not from the request IP, and
// falls back to San Francisco (US) when it is absent. The example sends Berlin
// so a personalized request lands in the EU audience the bootstrap seeds.
const EU_LOCATION = { city: 'Berlin', countryCode: 'DE', continent: 'EU' };

type SearchParams = Record<string, string | string[] | undefined>;

export function buildPagePersonalization(options: {
  origin: string;
  path: string;
  locale: string;
  referrer: string;
  searchParams: SearchParams;
}) {
  const url = new URL(options.path, options.origin);
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(options.searchParams)) {
    if (value === undefined) continue;
    query[key] = Array.isArray(value) ? (value.at(-1) ?? '') : value;
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, item);
    }
  }

  const page = {
    path: options.path,
    query,
    referrer: options.referrer,
    search: url.search,
    title: 'Contentful Experiences — Next.js example',
    url: url.toString(),
  };

  const event = eventBuilder.buildPageView({
    locale: options.locale,
    location: EU_LOCATION,
    page,
    properties: page,
  });

  // EventBuilder targets the full Optimization API schema. XDA embeds a
  // deliberately narrower page-event schema: consent is not accepted here,
  // and context.page excludes title (properties.title remains supported).
  const { gdpr: _gdpr, page: contextPage, ...context } = event.context;
  const { title: _title, ...xdaContextPage } = contextPage;

  return {
    events: [
      {
        ...event,
        context: {
          ...context,
          page: xdaContextPage,
        },
      },
    ],
  };
}
