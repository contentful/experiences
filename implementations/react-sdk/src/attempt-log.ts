import type { CoreStates } from '@contentful/experiences-web';

// Optional presentation diagnostics, adapted from Optimization's
// AnalyticsEventDisplay at 59add9d6ebff503b9033a59a2eee0149d4b4e925 (MIT).
// Count notifications, not successful deliveries; group only real interval IDs.
export interface AttemptRow {
  readonly id: number;
  readonly type: string;
  readonly value: string;
  readonly observedAt: number;
  readonly count: number;
  readonly intervalKey?: string;
  readonly durationMs?: number;
}

function toRow(event: unknown, id: number): AttemptRow | undefined {
  if (!event || typeof event !== 'object' || !('type' in event)) return;
  const fields = event as Record<string, unknown>;
  if (typeof fields.type !== 'string') return;
  const interval =
    fields.type === 'exo_node_view'
      ? 'view'
      : fields.type === 'exo_node_hover'
        ? 'hover'
        : undefined;
  const intervalId = interval && fields[`${interval}Id`];
  const duration = interval && fields[`${interval}DurationMs`];
  const durationMs = typeof duration === 'number' ? duration : undefined;
  const entity = typeof fields.entityId === 'string' ? fields.entityId : undefined;
  return {
    id,
    type: interval ?? (fields.type === 'exo_node_click' ? 'click' : fields.type),
    value: entity ?? fields.type,
    observedAt: Date.now(),
    count: 1,
    intervalKey:
      interval && typeof intervalId === 'string' && durationMs !== undefined
        ? `${interval}:${intervalId}`
        : undefined,
    durationMs,
  };
}

export function createAttemptLog() {
  let snapshot: { count: number; rows: readonly AttemptRow[] } = { count: 0, rows: [] };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Keep this callback identity stable and attach before runtime-driven work.
    onStatesReady: (states: CoreStates) => {
      let subscribing = true;
      const subscription = states.eventStream.subscribe((event) => {
        // subscribe emits current immediately. A historical last attempt is state,
        // not a new notification, including Strict Mode's activation replay.
        if (subscribing || event === undefined) return;
        const next = toRow(event, snapshot.count + 1);
        if (!next) return;
        const index =
          next.intervalKey === undefined
            ? -1
            : snapshot.rows.findIndex((row) => row.intervalKey === next.intervalKey);
        const rows = [...snapshot.rows];
        if (index < 0) rows.unshift(next);
        else {
          const previous = rows[index];
          rows[index] = {
            ...next,
            id: previous.id,
            observedAt: previous.observedAt,
            count: previous.count + 1,
          };
        }
        snapshot = { count: snapshot.count + 1, rows };
        for (const listener of listeners) listener();
      });
      subscribing = false;
      return () => subscription.unsubscribe();
    },
  };
}

export type AttemptLog = ReturnType<typeof createAttemptLog>;
