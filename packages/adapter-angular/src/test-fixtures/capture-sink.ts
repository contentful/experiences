/*
 * Shared sink for fixtures that need to prove what the renderer handed them.
 * Port of adapter-svelte/src/test-fixtures/capture-sink.ts — identical shape, so
 * the two parity suites assert against the same records.
 *
 * A module-level array rather than DI: a fixture is instantiated by
 * `ngComponentOutlet` deep inside the tree, so a test has no handle on it and no
 * injector to read from.
 */

import type { ContentfulComponent, RenderContext } from '../types.js';

export interface Capture {
  props: Record<string, unknown>;
  experience: RenderContext;
  contentful: ContentfulComponent | undefined;
  designValues?: Record<string, unknown>;
}

export const captureSink: Capture[] = [];
