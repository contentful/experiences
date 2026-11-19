import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { States } from '@contentful/experiences-web';
import { createAttemptLog } from './attempt-log';

test('caps recent rows while preserving the total and retained interval aggregation', () => {
  const log = createAttemptLog();
  let emit!: (event: unknown) => void;
  log.onStatesReady({
    eventStream: {
      subscribe(listener: typeof emit) {
        emit = listener;
        listener(undefined);
        return { unsubscribe() {} };
      },
    },
  } as unknown as States);
  for (let index = 0; index < 101; index++) emit({ type: 'track', event: String(index) });
  const view = { type: 'exo_node_view', viewId: 'retained', viewDurationMs: 100 };
  emit(view);
  const retained = log.getSnapshot().rows[0];
  emit({ ...view, viewDurationMs: 200 });
  const { count, rows } = log.getSnapshot();
  assert.equal(count, 103);
  assert.equal(rows.length, 100);
  assert.equal(rows.at(-1)?.value, '2');
  assert.deepEqual(rows[0], { ...retained, count: 2, durationMs: 200 });
});
