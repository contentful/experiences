import {
  DEFAULT_ALLOWED_EVENT_TYPES,
  resolveQueuePolicy,
  type AllowedEventType,
  type ConsentInput,
  toConsentState,
} from '@contentful/experiences-runtime';
import type { Profile } from '@contentful/optimization-api-client/api-schemas';
import { WebHandoffRuntime } from '../handoff/web-handoff-runtime.js';
import { createRuntimeConfig } from './runtime-config.js';
import type { Config } from '../sdk/types.js';
import type { Config as RuntimeConfig } from '@contentful/experiences-runtime';
import LocalStore from '../storage/local-store.js';
import * as signals from '../signals/index.js';

/** Activate the handoff owner's state and real queues without browser listeners or a singleton. */
export class HandoffRuntime extends WebHandoffRuntime<RuntimeConfig> {
  protected readonly onEventBlocked: Config['onEventBlocked'] = undefined;
  protected readonly personalizationQueue;
  protected readonly analyticsQueue;
  constructor(
    profile?: Profile,
    protected readonly allowedEventTypes: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES
  ) {
    const config = createRuntimeConfig({
      ...(profile === undefined ? {} : { defaults: { profile } }),
    });
    super({
      ...config,
      eventBuilder: { app: config.app, channel: 'web', library: { name: 'test', version: '1' } },
    });
    this.getAnonymousIdProvider = () =>
      signals.persistenceConsent.value === true ? LocalStore.anonymousId : undefined;
    this.initializeBrowserState(config.defaults, config.locale);
    this.eventBuilder.getConsent = () => signals.consent.value;
    this.initializeIdentity(undefined);
    this.personalizationQueue = this.initializePersonalizationQueue(resolveQueuePolicy(undefined));
    this.analyticsQueue = this.initializeAnalyticsQueue(resolveQueuePolicy(undefined));
    this.effects.push(this.installStateRevisionEffect());
    this.effects.push(this.installConnectivityEffect());
  }
  get isPreview() {
    return false;
  }
  protected syncInteractionConsent() {}
  setOnline(value: boolean) {
    this.online = value;
  }
  consent(input: ConsentInput) {
    const next = toConsentState(input);
    signals.batch(() => {
      if (next.events !== undefined) signals.consent.value = next.events;
      if (next.persistence !== undefined) signals.persistenceConsent.value = next.persistence;
      if (next.events === false) this.withdrawEventConsent(undefined);
    });
  }
  reset() {
    this.resetToken = {};
    this.clearCurrentPage();
    this.personalizationQueue.reset();
    this.analyticsQueue.clearQueuedEvents();
    signals.batch(() => this.resetVisitorState());
  }
  override destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resetToken = {};
    this.clearCurrentPage();
    this.personalizationQueue.reset();
    this.analyticsQueue.clearPeriodicFlushTimer();
    this.analyticsQueue.clearScheduledRetry();
    for (const dispose of this.effects.splice(0)) dispose();
    super.destroy();
  }
}
