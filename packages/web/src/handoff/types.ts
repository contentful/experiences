import {
  parseExperiencesHandoffEnvelope,
  type EventEmissionResult,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
export type HandoffEnvelope = ReturnType<typeof parseExperiencesHandoffEnvelope>;

export interface HandoffInitialization {
  readonly key: string | ExperiencesHandoff;
  readonly routeKey: string;
  readonly callers: Set<() => boolean>;
  readonly isCurrent: () => boolean;
  identityReady?: Promise<string | undefined>;
  hydration?: Promise<void>;
  delivery?: Promise<EventEmissionResult>;
}
