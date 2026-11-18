import type { HandleFetch, RequestEvent } from '@sveltejs/kit';
import { createServerOperation } from './server-operation.js';
import {
  assertRouteKey,
  readPreparationRequest,
  type PreparationInput,
} from './request-protocol.js';
import type { ServerBindingOptions } from './server-types.js';
import type { RequestResult } from './request-result.js';

const privateHeaders = { 'cache-control': 'private, no-store' };

function json(value: unknown, status = 200) {
  return new globalThis.Response(JSON.stringify(value), {
    status,
    headers: { ...privateHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

// JSON object key order must not create a second primary operation.
function identity(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(identity).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${identity((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** @internal The public facade supplies Kit's build state without ambient request access. */
export function createSvelteKitServerBinding(
  options: ServerBindingOptions,
  environment: { building?: boolean } = {}
) {
  assertRouteKey(options.endpoint);
  if (options.endpoint.includes('?'))
    throw new TypeError('The preparation endpoint must be a pathname.');
  const operate = createServerOperation(options);
  const primaries = new WeakMap<RequestEvent, { key: string; result: Promise<RequestResult> }>();

  async function prepare(
    event: RequestEvent,
    request: globalThis.Request,
    internal: boolean
  ): Promise<globalThis.Response> {
    if (environment.building) {
      return json({ error: 'Experience request preparation is unavailable while building.' }, 503);
    }
    if (!internal && request.headers.get('origin') !== event.url.origin) {
      return json({ error: 'Preparation requires a same-origin request.' }, 403);
    }
    let input: PreparationInput;
    try {
      input = await readPreparationRequest(request);
    } catch {
      return json({ error: 'Invalid Experience preparation request.' }, 400);
    }
    const document =
      internal &&
      !event.isDataRequest &&
      !event.isSubRequest &&
      !/\b(prefetch|prerender)\b/i.test(
        `${event.request.headers.get('purpose') ?? ''} ${event.request.headers.get('sec-purpose') ?? ''}`
      ) &&
      (event.request.method === 'GET' || event.request.method === 'HEAD') &&
      input.routeKey === event.url.pathname + event.url.search;
    if (!internal) return json(await operate(event, input, { document: false }));

    const key = identity(input);
    let primary = primaries.get(event);
    if (primary && primary.key !== key) {
      return json(
        { error: 'Only one primary Experience operation is supported per request.' },
        409
      );
    }
    if (!primary) {
      // Kit forbids setting the same header twice within an outer response.
      event.setHeaders(privateHeaders);
      const result = operate(event, input, { document });
      primary = { key, result };
      primaries.set(event, primary);
    }
    return json(await primary.result);
  }

  const handleFetch: HandleFetch = ({ event, request, fetch }) => {
    const url = new URL(request.url);
    if (
      url.origin !== event.url.origin ||
      url.pathname !== options.endpoint ||
      url.search ||
      request.method !== 'POST'
    ) {
      return fetch(request);
    }
    return prepare(event, request, true);
  };

  return {
    request: {
      handleFetch,
      /** Public endpoint: never gains document authority from request fields or headers. */
      handlePreparation: (event: RequestEvent) => prepare(event, event.request, false),
    },
  };
}
