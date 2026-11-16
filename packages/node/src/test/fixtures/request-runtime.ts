import type { DirectEventBindings } from '../../request/event-methods.js';
import { vi } from 'vitest';
import { RequestBoundExperiences } from '../../request/request-runtime.js';
import type { RequestContext, ConsentPolicy } from '../../request/types.js';
import type { EventMethods } from '@contentful/experiences-runtime';
import {
  EventBuilder,
  InterceptorManager,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import type { ContentfulExperiences } from '../../sdk/contentful-experiences.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../../sdk-info.js';

/** Stable runtime dependencies only; no clients, request state, consent or transport. */
export function requestRuntimeFixture(): Pick<
  ContentfulExperiences,
  'config' | 'locale' | 'interceptors' | 'eventBuilder'
> {
  const config: ContentfulExperiences['config'] = {
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'token' },
    eventBuilder: { channel: 'server' },
  };
  return {
    config,
    locale: 'en-US',
    interceptors: { event: new InterceptorManager<OptimizationEventStreamEvent>() },
    eventBuilder: new EventBuilder({
      channel: 'server',
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      app: { name: 'site', version: '1.0.0' },
      getLocale: () => 'en-US',
    }),
  };
}

class TestRequest extends RequestBoundExperiences {
  previewOverride: boolean | undefined;
  override get isPreview(): boolean {
    return this.previewOverride ?? super.isPreview;
  }
  get requestPreflight() {
    return this.preflight;
  }
  get requestEventContext() {
    return this.getRequestEventContext();
  }
}

export function createBoundRequest(
  context: RequestContext = {},
  runtime: Pick<
    ContentfulExperiences,
    'config' | 'locale' | 'interceptors' | 'eventBuilder'
  > = requestRuntimeFixture(),
  policy: ConsentPolicy = {}
) {
  const accept = async () => ({ accepted: true as const });
  const methods = {
    profile: undefined,
    identify: vi.fn(accept),
    page: vi.fn(accept),
    track: vi.fn(accept),
    trackView: vi.fn(accept),
    trackClick: vi.fn(accept),
    trackHover: vi.fn(accept),
    trackFlagView: vi.fn(accept),
  } satisfies EventMethods;
  let bindings!: DirectEventBindings;
  const request = new TestRequest(
    runtime as ContentfulExperiences,
    context,
    (next) => {
      bindings = next;
      return methods;
    },
    policy,
    vi.fn(),
    vi.fn()
  );
  return { request, runtime, bindings, methods };
}
