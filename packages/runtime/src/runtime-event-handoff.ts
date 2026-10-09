import {
  ExperienceEvent as PersonalizationEventSchema,
  InsightsEvent as AnalyticsEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent as PersonalizationEvent,
  type InsightsEvent as AnalyticsEvent,
} from '@contentful/optimization-api-client/api-schemas';
import * as z from 'zod/mini';

export const RUNTIME_EVENT_HANDOFF_VERSION = 1 as const;

const RUNTIME_EVENT_HANDOFF_MAX_BYTES = 64 * 1024;
const encoder = new globalThis.TextEncoder();
const RuntimeEventHandoffSchema = z.object({
  version: z.literal(RUNTIME_EVENT_HANDOFF_VERSION),
  spaceId: z.string(),
  environmentId: z.string(),
  initialProfileId: z.optional(z.string()),
  events: z.array(
    z.discriminatedUnion('transport', [
      z.object({
        transport: z.literal('personalization'),
        event: PersonalizationEventSchema,
      }),
      z.object({
        transport: z.literal('analytics'),
        event: AnalyticsEventSchema,
      }),
    ])
  ),
  initialPageRouteKey: z.optional(z.string()),
});

/** Server-only delivery choice. Browser runtimes always commit received handoffs. */
export type RuntimeServerEventDelivery = 'commit' | 'handoff';

export type RuntimeEventHandoffEvent =
  | { readonly transport: 'personalization'; readonly event: PersonalizationEvent }
  | { readonly transport: 'analytics'; readonly event: AnalyticsEvent };

/** Plain JSON passed from one Node request to its paired Web runtime. */
export interface RuntimeEventHandoff {
  readonly version: typeof RUNTIME_EVENT_HANDOFF_VERSION;
  readonly spaceId: string;
  readonly environmentId: string;
  /** Profile known before any preflight event was evaluated. */
  readonly initialProfileId?: string;
  readonly events: readonly RuntimeEventHandoffEvent[];
  /** App-defined route identity for a successfully staged initial page event. */
  readonly initialPageRouteKey?: string;
}

/** Returned only after the complete Web replay succeeds. */
export interface RuntimeEventHandoffReceipt {
  readonly initialPageRouteKey?: string;
}

/** Enforces the private response payload cap without parsing trusted Node data. */
export function assertRuntimeEventHandoffSize(input: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch (error) {
    throw new TypeError('Runtime event handoff must be JSON serializable', { cause: error });
  }
  if (serialized === undefined) throw new TypeError('Runtime event handoff is not serializable');
  if (encoder.encode(serialized).byteLength > RUNTIME_EVENT_HANDOFF_MAX_BYTES) {
    throw new TypeError(
      `Runtime event handoff exceeds ${RUNTIME_EVENT_HANDOFF_MAX_BYTES} serialized bytes`
    );
  }
}

/** Validates an untrusted serialized handoff before Web starts any transport. */
export function parseRuntimeEventHandoff(input: unknown): RuntimeEventHandoff {
  assertRuntimeEventHandoffSize(input);
  const handoff = parseOptimizationSchema(RuntimeEventHandoffSchema, input);

  if (
    handoff.initialPageRouteKey !== undefined &&
    !handoff.events.some(
      (entry) => entry.transport === 'personalization' && entry.event.type === 'page'
    )
  ) {
    throw new TypeError('Runtime event handoff initial page requires a staged page event');
  }

  let hasProfile = handoff.initialProfileId !== undefined;
  for (const entry of handoff.events) {
    if (entry.transport === 'personalization') {
      hasProfile = true;
    } else if (!hasProfile) {
      throw new TypeError(
        'Runtime event handoff Analytics events require an initial or preceding Personalization profile'
      );
    }
  }

  return handoff;
}
