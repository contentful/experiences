import {
  serializePersonalization,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import {
  buildFetchPersonalization,
  hasEventTypeConsent,
  methodForEventType,
  withEventConsent,
  type ConsentState,
  type InterceptorManager,
  type OptimizationEventStreamEvent,
  type RuntimePersonalizationOptions,
} from '@contentful/experiences-runtime';
import type { ConsentPolicy, ExperiencesNodeRequest } from './types.js';
export type BuiltFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: PersonalizationOptions;
};
type PersonalizationBindings = Pick<
  ExperiencesNodeRequest,
  'locale' | 'isPreview' | 'eventBuilder'
> & {
  getProfile(): ExperiencesNodeRequest['profile'];
  readonly consent: ConsentState;
  readonly consentPolicy: ConsentPolicy;
  getInterceptors(): InterceptorManager<OptimizationEventStreamEvent>;
  assertActive(): void;
};
/** Reads the request owner's state; never retains independent identity or lifetime state. */
export class RequestPersonalization {
  constructor(private readonly bindings: PersonalizationBindings) {}
  /**
   * Drops XDA event intent before building when this request's consent does not admit it. The
   * profile id still travels, since it is not an event.
   */
  gate<T extends { personalization?: RuntimePersonalizationOptions; locale?: string }>(
    options: T
  ): BuiltFetchOptions<T> {
    const profileId = options.personalization?.profileId ?? this.bindings.getProfile()?.id;
    options = {
      ...options,
      ...('experienceId' in options ? { locale: options.locale ?? this.bindings.locale } : {}),
      ...(profileId === undefined
        ? {}
        : { personalization: { ...options.personalization, profileId } }),
    };
    if (this.bindings.isPreview) {
      for (const event of options.personalization?.events ?? []) this.admitEvent(event);
      return { ...options, personalization: undefined };
    }
    const personalization =
      options.personalization === undefined
        ? undefined
        : buildFetchPersonalization(
            {
              ...options.personalization,
              events: options.personalization.events?.filter((event) => this.admitEvent(event)),
            },
            this.bindings.eventBuilder
          );
    return {
      ...options,
      personalization:
        personalization === undefined
          ? undefined
          : {
              ...personalization,
              events: personalization.events?.map((event) =>
                withEventConsent(event, this.bindings.consent.events === true)
              ),
            },
    };
  }

  async intercept<T extends { personalization?: PersonalizationOptions }>(options: T): Promise<T> {
    const personalization = options.personalization;
    if (personalization?.events === undefined) return options;
    const events = await Promise.all(
      personalization.events.map((event) => this.bindings.getInterceptors().run(event))
    );
    this.bindings.assertActive();
    return this.finalize(options, { ...personalization, events });
  }

  finalize<T extends { personalization?: PersonalizationOptions }>(
    options: T,
    personalization: unknown = options.personalization
  ): T {
    if (personalization === undefined) return options;
    const valid = serializePersonalization(personalization);
    return {
      ...options,
      personalization: {
        ...valid,
        events: valid.events?.filter((event) => this.admitEvent(event, true)),
      },
    };
  }

  /** Validate the final transport type before applying this request's consent policy. */
  private admitEvent(event: { readonly type: string }, transformed = false): boolean {
    const { allowedEventTypes, onEventBlocked } = this.bindings.consentPolicy;
    if (
      !this.bindings.isPreview &&
      hasEventTypeConsent(event.type, this.bindings.consent, allowedEventTypes)
    )
      return true;
    const method = methodForEventType(event.type) ?? (transformed ? event.type : undefined);
    if (method !== undefined) {
      try {
        onEventBlocked?.({
          reason: this.bindings.isPreview ? 'preview' : 'consent',
          method,
          args: [event],
        });
      } catch {
        // A failing diagnostic callback must not break event delivery.
      }
    }
    return false;
  }
}
