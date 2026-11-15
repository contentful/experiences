import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  InterceptorManager,
  type OptimizationEventStreamEvent,
  type Config as BaseConfig,
} from '@contentful/experiences-runtime';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';
import { RequestBoundExperiences } from '../request/request-runtime.js';
import type { Config, ConsentPolicy, RequestContext, RequestRuntime } from '../request/types.js';

/** Node SDK with stable transport configuration and request-local event state. */
export class ContentfulExperiences extends RuntimeContentfulExperiences<
  Config & Pick<BaseConfig, 'eventBuilder'>
> {
  readonly #consentPolicy: ConsentPolicy;
  readonly interceptors = { event: new InterceptorManager<OptimizationEventStreamEvent>() };

  constructor(config: Config) {
    const { app, allowedEventTypes, onEventBlocked } = config;
    super({
      ...config,
      eventBuilder: {
        app,
        channel: 'server',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      },
    });
    this.#consentPolicy = { allowedEventTypes, onEventBlocked };
  }

  forRequest(context: RequestContext = {}): RequestRuntime {
    return new RequestBoundExperiences(
      this,
      context,
      (bindings) => this.createEventMethods(bindings),
      this.#consentPolicy,
      (options, resolveOptions) => this.fetchExperiencePayload(options, resolveOptions),
      (session) => this.fetchPreviewSessionPayload(session)
    );
  }
}
