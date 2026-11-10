import {
  type EventEmissionResult,
  type ExperiencesHandoff,
  parseExperiencesHandoffEnvelope,
  validatePreparedEvents,
  withEventConsent,
} from '@contentful/experiences-runtime';
import { consent as consentSignal, profile as profileSignal } from '../signals/index.js';
type ValidatedPreparedEvents = ReturnType<typeof validatePreparedEvents>;

import { AcceptedCurrentPageTracker } from '../handoff/accepted-current-page-tracker.js';
import { shouldApplyHandoffProfile } from '../handoff/handoff-continuity.js';

import { WebContentRuntime } from '../content/web-content-runtime.js';
import type { CurrentPageOptions, HydrateAndTrackCurrentPageOptions } from '../sdk/types.js';
import type { HandoffEnvelope, HandoffInitialization } from './types.js';
const unguardedHandoffCaller = () => true;

/** Current-route replay and hydration retain the SDK's identity, consent and lifetime owner. */
export abstract class WebHandoffRuntime extends WebContentRuntime {
  private currentInitialization: HandoffInitialization | undefined;
  private readonly consumedHandoffs = new Set<string>();
  protected readonly currentPage = new AcceptedCurrentPageTracker();

  /** Deduplicate accepted page emissions for the current route. Manual page() stays direct. */
  async trackCurrentPage({
    routeKey,
    buildPayload,
    isCurrent,
  }: CurrentPageOptions): Promise<EventEmissionResult> {
    if (this.destroyed) return { accepted: false };
    if (isCurrent?.() === false) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('trackCurrentPage', [routeKey]);
    this.requireRouteKey(routeKey);
    this.clearHandoffInitialization(routeKey);
    return await this.currentPage.emitIfNeeded(routeKey, () => {
      const payload = buildPayload({ isInitialEmission: !this.currentPage.hasAccepted() }) ?? {};
      if (isCurrent?.() === false) return Promise.resolve({ accepted: false });
      if (isCurrent === undefined || !this.hasConsent('page')) return this.page(payload);
      return this.experienceQueue.send(this.eventBuilder.buildPageView(payload), isCurrent);
    });
  }

  /** Consume one complete handoff and admit its matching evaluated events once. */
  async hydrateAndTrackCurrentPage(
    handoff: ExperiencesHandoff,
    {
      routeKey,
      buildPayload,
      isCurrent = unguardedHandoffCaller,
    }: HydrateAndTrackCurrentPageOptions
  ): Promise<EventEmissionResult> {
    if (this.destroyed) return { accepted: false };
    if (!isCurrent()) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('hydrateAndTrackCurrentPage', [routeKey]);
    this.requireRouteKey(routeKey);
    const parsed = parseExperiencesHandoffEnvelope(handoff, this);
    const hasPage =
      parsed.replay?.events.some(
        (event) =>
          typeof event === 'object' && event !== null && 'type' in event && event.type === 'page'
      ) === true;
    const token = this.resetToken;
    const initialization = this.getHandoffInitialization(handoff, parsed, routeKey, isCurrent);
    if (initialization.delivery !== undefined) return await initialization.delivery;
    const consumed =
      typeof initialization.key === 'string' && this.consumedHandoffs.has(initialization.key);
    if (consumed && (!hasPage || !initialization.isCurrent())) return { accepted: false };

    // Begin the current attempt by checking and publishing identity synchronously.
    // Once visible to other operations, navigation retains this continuation.
    // This is local identity readiness, not XPAPI commit completion. Current fetches
    // do not await replay HTTP; provisional-ID profile-only lookups can therefore fail.
    // See Runtime README's XDA preflight and profile finalization contract.
    const identityReady = Promise.resolve().then(() =>
      !consumed && initialization.isCurrent()
        ? this.adoptHandoffIdentity(parsed, initialization.isCurrent)
        : undefined
    );
    initialization.identityReady = identityReady;
    const attempt = identityReady.then(async (targetId): Promise<EventEmissionResult> => {
      if (!initialization.isCurrent()) return { accepted: false };
      if (!consumed) await this.hydrateHandoffState(parsed, initialization);
      if (!initialization.isCurrent()) return { accepted: false };

      if (!consumed && parsed.replay?.routeKey === routeKey) {
        const result = await this.sendPreparedExperienceEvents(
          parsed.replay.events,
          targetId,
          parsed.replay.locale,
          initialization
        );
        if (result.accepted) {
          if (
            hasPage &&
            !this.destroyed &&
            this.isCurrent(token) &&
            this.currentInitialization === initialization
          )
            this.currentPage.markAccepted(routeKey);
          return result;
        }
        // A refused identify/track batch has no page intent to fall back to.
        if (!hasPage && (parsed.replay.events.length !== 0 || buildPayload === undefined))
          return result;
      }

      if (
        !initialization.isCurrent() ||
        (buildPayload === undefined && (!hasPage || parsed.replay?.routeKey !== routeKey))
      )
        return { accepted: false };
      return await this.trackCurrentPage({
        routeKey,
        buildPayload: buildPayload ?? (() => ({})),
        isCurrent: initialization.isCurrent,
      });
    });
    const delivery = attempt.then(
      (result) => {
        if (
          result.accepted &&
          !this.destroyed &&
          this.isCurrent(token) &&
          typeof initialization.key === 'string' &&
          parsed.replay?.routeKey === routeKey
        )
          this.consumedHandoffs.add(initialization.key);
        if (!result.accepted && initialization.delivery === delivery) {
          initialization.delivery = undefined;
        }
        return result;
      },
      (error: unknown) => {
        if (initialization.delivery === delivery) initialization.delivery = undefined;
        throw error;
      }
    );
    initialization.delivery = delivery;
    return await delivery;
  }

  private requireRouteKey(routeKey: string): void {
    if (!routeKey.startsWith('/')) {
      throw new TypeError('Current page requires a pathname/search route key');
    }
  }

  private getHandoffInitialization(
    input: ExperiencesHandoff,
    parsed: HandoffEnvelope,
    routeKey: string,
    callerIsCurrent: () => boolean
  ): HandoffInitialization {
    const finalEvent = parsed.replay?.events.at(-1);
    const key =
      typeof finalEvent === 'object' &&
      finalEvent !== null &&
      'messageId' in finalEvent &&
      typeof finalEvent.messageId === 'string'
        ? finalEvent.messageId
        : input;
    const current = this.currentInitialization;
    if (current?.routeKey === routeKey && current.key === key && current.isCurrent()) {
      current.callers.add(callerIsCurrent);
      return current;
    }

    const token = this.resetToken;
    const initialization: HandoffInitialization = {
      key,
      routeKey,
      callers: new Set([callerIsCurrent]),
      isCurrent: () =>
        !this.destroyed &&
        this.isCurrent(token) &&
        this.currentInitialization === initialization &&
        [...initialization.callers].some((caller) => caller()),
    };
    // Remember admitted or consent-dropped replay without reviving it or cancelling a
    // newer initialization. A new visitor action carries fresh message IDs.
    if (
      typeof key === 'string' &&
      this.consumedHandoffs.has(key) &&
      (current?.key !== key || current.routeKey !== routeKey)
    )
      return initialization;
    this.currentInitialization = initialization;
    return initialization;
  }

  private clearHandoffInitialization(routeKey?: string): void {
    if (routeKey !== undefined && this.currentInitialization?.routeKey === routeKey) return;
    this.currentInitialization = undefined;
  }

  protected awaitCurrentHandoffIdentity(): Promise<void> | undefined {
    const initialization = this.currentInitialization;
    if (initialization === undefined || !initialization.isCurrent()) return undefined;
    const pending = initialization.identityReady ?? initialization.hydration;
    return pending?.then(() =>
      this.currentInitialization !== initialization ? this.awaitCurrentHandoffIdentity() : undefined
    );
  }

  private hydrateHandoffState(
    handoff: HandoffEnvelope,
    initialization: HandoffInitialization
  ): Promise<void> {
    if (handoff.replay !== undefined && handoff.replay.routeKey !== initialization.routeKey) {
      return Promise.resolve();
    }
    if (initialization.hydration !== undefined) return initialization.hydration;

    const stateRevision = this.stateRevision;
    const hydration = Promise.resolve().then(async () => {
      if (!initialization.isCurrent() || this.stateRevision !== stateRevision) return;
      // Profileless/cacheable hydration declares success without changing continuity.
      await this.applyOptimizationDataToSignals(
        {
          ...(shouldApplyHandoffProfile(handoff) ? { profile: handoff.state?.profile } : {}),
          ...(handoff.cache.scope === 'private-request' &&
          handoff.state &&
          Object.hasOwn(handoff.state, 'changes')
            ? { changes: handoff.state.changes }
            : {}),
        },
        initialization.isCurrent,
        () => shouldApplyHandoffProfile(handoff),
        () => handoff.cache.scope === 'private-request'
      );
    });
    initialization.hydration = hydration.catch((error: unknown) => {
      initialization.hydration = undefined;
      throw error;
    });
    return initialization.hydration.finally(() => {
      if (!initialization.isCurrent()) initialization.hydration = undefined;
    });
  }

  private adoptHandoffIdentity(
    handoff: HandoffEnvelope,
    isCurrent: () => boolean
  ): string | undefined {
    const profileId = profileSignal.value?.id ?? this.anonymousIdProvider() ?? handoff.profileId;
    if (!isCurrent()) return undefined;
    this.setAdoptedProfileId(profileId);
    return profileId;
  }

  /** Queue one already-selected prepared target without waiting for HTTP delivery. */
  protected sendPreparedExperienceEvents(
    events: readonly unknown[],
    profileId?: string,
    locale?: string,
    initialization?: HandoffInitialization
  ): Promise<EventEmissionResult> {
    if (this.destroyed) return Promise.resolve({ accepted: false });
    if (this.isPreview)
      return Promise.resolve(this.skipPreviewEvent('sendPreparedExperienceEvents', [events]));
    const token = this.resetToken;
    const isCurrent = (): boolean =>
      !this.destroyed && this.isCurrent(token) && initialization?.isCurrent() !== false;
    const handoffKey = typeof initialization?.key === 'string' ? initialization.key : undefined;
    let valid: ValidatedPreparedEvents;
    try {
      valid = validatePreparedEvents(events);
    } catch {
      return Promise.resolve({ accepted: false });
    }
    // Reserve the supplied aggregate before callbacks can reenter. A consent
    // refusal is terminal; capacity refusal below leaves unadmitted work eligible.
    if (handoffKey !== undefined) this.consumedHandoffs.add(handoffKey);
    let allowed = true;
    for (const event of valid) {
      if (!this.admitEvent(event, true)) allowed = false;
      if (!isCurrent()) return Promise.resolve({ accepted: false });
    }
    if (!allowed) return Promise.resolve({ accepted: false });
    const admitted = valid.map((event) => withEventConsent(event, consentSignal.value === true));
    const result = this.experienceQueue.sendPrepared(admitted, { profileId, locale });
    if (!result.accepted && isCurrent() && handoffKey !== undefined)
      this.consumedHandoffs.delete(handoffKey);
    if (result.accepted && isCurrent() && profileSignal.value === undefined)
      this.setAdoptedProfileId(profileId ?? this.adoptedProfileId.value);
    return Promise.resolve(result);
  }

  protected clearCurrentPage(): void {
    this.currentInitialization = undefined;
    this.consumedHandoffs.clear();
    this.currentPage.reset();
  }
}
