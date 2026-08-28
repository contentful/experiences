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

import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import type { Config } from './types.js';

export interface ServerExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  initialViewportId?: string;
  renderUnknown?: RenderUnknown;
}

export type ClientExperienceRendererProps = ServerExperienceRendererProps;

export interface MissingComponentProps {
  componentId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
}

export type RenderUnknown = Component<MissingComponentProps>;

export interface DebugExperienceProps {
  /** The resolved plan to inspect (what a renderer receives as `experience`). */
  experience: PortableRenderPlan;
  /** Start expanded. Defaults to collapsed to stay out of the way. */
  defaultOpen?: boolean;
}
