/*
 * Public prop-shape types for the renderer components. They're declared
 * here (rather than inside `<script module>` blocks of the .svelte files)
 * so that:
 *
 *  - `tsc --noEmit` typechecks the package without the Svelte language
 *    server. tsc can't see exports inside a .svelte module block;
 *    `svelte-check` can. Keeping prop types in plain TS keeps both happy.
 *  - `index.ts` re-exports them with `export type`, which compiles cleanly.
 *
 * The .svelte files import these and use them as their `$props()` type.
 */

import type { Component } from 'svelte';

import type { ExperienceContext, PortableRenderPlan } from '@contentful/experiences-core';
import type { PreviewCapabilities } from '@contentful/experiences-preview-svelte';

import type { Config, RenderContext } from './types.js';

export interface ServerExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  initialViewportId?: string;
  context?: Partial<ExperienceContext>;
  renderUnknown?: RenderUnknown;
}

export interface ClientExperienceRendererProps extends ServerExperienceRendererProps {
  /**
   * Opt in to Contentful editor preview. See `ClientExperienceRenderer` in
   * `@contentful/experiences-react` for full docs — behavior is identical.
   */
  enablePreview?: boolean;

  /** Preview capabilities advertised to the editor. Ignored when `enablePreview` is false. */
  previewCapabilities?: Partial<PreviewCapabilities>;

  /** Editor origin override for the postMessage target. Ignored when `enablePreview` is false. */
  previewTargetOrigin?: string | string[];
}

export interface MissingComponentProps {
  componentTypeId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
  experience: RenderContext;
}

export type RenderUnknown = Component<MissingComponentProps>;
