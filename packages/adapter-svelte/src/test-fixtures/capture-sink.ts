/*
 * Shared mutable sink for the CapturingComponent test fixture. Tests
 * `.splice(0)` between runs to reset.
 */

import type { ContentfulComponent } from '../types.js';
import type { RenderContext } from '../types.js';

export interface Capture {
  props: Record<string, unknown>;
  experience: RenderContext;
  contentful: ContentfulComponent | undefined;
}

export const captureSink: Capture[] = [];
