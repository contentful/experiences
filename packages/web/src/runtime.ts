/**
 * Runtime contracts shared by live browser and snapshot-backed presentation layers.
 *
 * @packageDocumentation
 */

import type { ContentfulExperiences } from './contentful-experiences.js';
import { createSnapshotRuntime, type ExperiencesSnapshot } from './runtime/snapshot-runtime.js';

type RuntimeMembers =
  | 'consent'
  | 'destroy'
  | 'flush'
  | 'hasConsent'
  | 'identify'
  | 'locale'
  | 'page'
  | 'reset'
  | 'setLocale'
  | 'states'
  | 'track'
  | 'trackClick'
  | 'trackFlagView'
  | 'trackHover'
  | 'trackView';

/**
 * Runtime contract shared by the stateful Web SDK and snapshot runtimes.
 *
 * @remarks
 * Exposes observable state and event actions for presentation layers. Experience fetching and
 * resolution remain separate: snapshot runtimes read state already resolved by the server.
 *
 * @public
 */
export type ExperiencesRuntime = Pick<ContentfulExperiences, RuntimeMembers>;

export {
  createSnapshotRuntime,
  type ExperiencesSnapshot,
  type SnapshotRuntime,
} from './runtime/snapshot-runtime.js';

/** Browser tracking controls layered over the universal presentation runtime. */
export interface WebExperiencesRuntime
  extends ExperiencesRuntime, Pick<ContentfulExperiences, 'tracking'> {}

/** Snapshot runtime with inert browser-only tracking controls, safe during SSR. */
export function createWebSnapshotRuntime(snapshot?: ExperiencesSnapshot): WebExperiencesRuntime {
  return Object.assign(createSnapshotRuntime(snapshot), {
    tracking: {
      enable() {},
      disable() {},
      enableElement() {},
      disableElement() {},
      clearElement() {},
    },
  });
}
