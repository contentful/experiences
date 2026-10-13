import type { EventOptimizationData } from './runtime-event-methods.js';

/** Admission result; queued delivery can be accepted without response data. */
export type EventEmissionResult<TData = EventOptimizationData> =
  | { readonly accepted: false; readonly data?: never }
  | { readonly accepted: true; readonly data?: TData };
