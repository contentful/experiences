import type {
  parseExperiencesHandoffEnvelope,
  ExperiencesHandoff,
  EventEmissionResult,
} from '@contentful/experiences-runtime';

import type { PreparationApplicability } from '../sdk/types.js';

export type HandoffEnvelope = ReturnType<typeof parseExperiencesHandoffEnvelope>;

export interface HandoffInitialization {
  readonly preparation?: PreparationApplicability;
  readonly key: string | ExperiencesHandoff;
  readonly routeKey: string;
  readonly callers: Set<() => boolean>;
  readonly isCurrent: () => boolean;
  identityReady?: Promise<string | undefined>;
  hydration?: Promise<void>;
  delivery?: Promise<EventEmissionResult>;
}
