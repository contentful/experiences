/**
 * Runtime contracts shared by live browser and snapshot-backed presentation layers.
 *
 * @packageDocumentation
 */

import type { ContentfulExperiences } from './contentful-experiences.js';

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
