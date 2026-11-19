import type { ElementViewObserverOptions } from './view/element-view-observer-support.js';

/** Optimization-compatible interaction controls. Manual data is Experiences attribution. */
export type EntryInteraction = keyof EntryInteractionTrackers;
export type EntryElementInteraction = EntryInteraction;
export type AutoTrackEntryInteractionOptions = Partial<Record<EntryInteraction, boolean>>;
export type EntryViewInteractionStartOptions = ElementViewObserverOptions;
export interface EntryClickInteractionElementOptions {
  /** Experiences TrackingAttribution; valid data overrides automatic scope attribution. */
  readonly data?: unknown;
}
export interface EntryViewInteractionElementOptions {
  /** Experiences TrackingAttribution for this element's view occurrence. Retained by reference. */
  readonly data?: unknown;
}
export interface EntryHoverInteractionElementOptions {
  /** Experiences Fragment TrackingAttribution for this element's hover occurrence. */
  readonly data?: unknown;
}
export interface EntryInteractionStartOptionsMap {
  clicks: undefined;
  views: EntryViewInteractionStartOptions | undefined;
  hovers: undefined;
}
export interface EntryInteractionElementOptionsMap {
  clicks: EntryClickInteractionElementOptions;
  views: EntryViewInteractionElementOptions;
  hovers: EntryHoverInteractionElementOptions;
}
/** Minimal tracker contract for one interaction, matching Optimization. */
export interface EntryInteractionTracker<TStartOptions = never, TElementOptions = never> {
  start: (options?: TStartOptions) => void;
  stop: () => void;
  setAuto?: (enabled: boolean) => void;
  enableElement?: (element: Element, options?: TElementOptions) => void;
  disableElement?: (element: Element) => void;
  clearElement?: (element: Element) => void;
}

/** Type contract for the three tracked interactions; no runtime registry is exposed. */
export interface EntryInteractionTrackers {
  clicks: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['clicks'],
    EntryInteractionElementOptionsMap['clicks']
  >;
  views: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['views'],
    EntryInteractionElementOptionsMap['views']
  >;
  hovers: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['hovers'],
    EntryInteractionElementOptionsMap['hovers']
  >;
}

export type EntryInteractionStartOptions<T extends EntryInteraction> =
  EntryInteractionStartOptionsMap[T];
export type EntryInteractionElementOptions<T extends EntryElementInteraction> =
  EntryInteractionElementOptionsMap[T];
export interface EntryInteractionApi {
  enable<T extends EntryInteraction>(
    interaction: T,
    options?: EntryInteractionStartOptions<T>
  ): void;
  disable(interaction: EntryInteraction): void;
  enableElement<T extends EntryElementInteraction>(
    interaction: T,
    element: Element,
    options?: EntryInteractionElementOptions<T>
  ): void;
  disableElement(interaction: EntryElementInteraction, element: Element): void;
  clearElement(interaction: EntryElementInteraction, element: Element): void;
}

/** The event methods interaction tracking sends through, which consent can gate. */
export type TrackedMethod = 'trackView' | 'trackHover' | 'trackClick';

/**
 * Wiring that the runtime supplies rather than the application: whether a method may
 * currently be sent. Detectors run only while it is, so permission starts a fresh
 * measurement instead of reporting time measured before it was granted.
 */
export interface InteractionTrackingGate {
  isAllowed(method: TrackedMethod): boolean;
  /** Invalidates delayed callbacks across the owning runtime's lifecycle boundaries. */
  getResetToken?(): unknown;
}

export interface InteractionTracking {
  hasAutoTracking(): boolean;
  readonly tracking: EntryInteractionApi;
  /**
   * Starts or stops detectors to match what is currently permitted. Call after consent
   * changes. A detector that becomes permitted starts a new measurement interval.
   */
  syncConsent(): void;
  /** Discards measurements and stops detectors; consent synchronization can resume them. */
  reset(preserveOverrides?: boolean): void;
  /** Ends in-progress views/hovers, sending their final events, and awaits them. */
  endActive(): Promise<void>;
  /** Stops discovery and every detector. Call `endActive()` first to flush in-progress events. */
  destroy(): void;
}
