import type { EntryInteractionApi } from '../interaction-tracking.js';

/** Internal names shared by element overrides and mutation observation. */
export const INTERACTION_ATTRIBUTES = {
  views: 'data-ctfl-track-views',
  hovers: 'data-ctfl-track-hovers',
  clicks: 'data-ctfl-track-clicks',
} as const;

/** Stateless SSR controls; freezing prevents one snapshot from changing another. */
export const NOOP_TRACKING: EntryInteractionApi = Object.freeze({
  enable() {},
  disable() {},
  enableElement() {},
  disableElement() {},
  clearElement() {},
});
