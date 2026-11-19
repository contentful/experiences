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

import type { Config, ExperienceRootProps } from '../registry/types.js';

export interface ServerExperienceRendererProps {
  /** Native Experience container, e.g. tbody inside a table or optgroup inside a select. */
  // eslint-disable-next-line no-undef -- TypeScript's DOM library defines the intrinsic HTML tag map.
  as?: keyof HTMLElementTagNameMap;
  /** Container attributes. The renderer owns plan attribution and children. */
  rootProps?: ExperienceRootProps;
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /** Shallow-merges over the plan's `metadata`. Only needed to override it. */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree. Defaults to the plan's `debug`.
   */
  debug?: boolean;
  renderUnknown?: RenderUnknown;
  /** Override the fallback rendered when a registered component throws. */
  renderError?: RenderError;
}

export type ClientExperienceRendererProps = ServerExperienceRendererProps;

export interface MissingComponentProps {
  componentId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
}

export type RenderUnknown = Component<MissingComponentProps>;

export interface ComponentErrorProps {
  componentId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
  /** The boundary error's message, after the host's error transform when configured. */
  message?: string;
  /** Retry this node's rendering through its native Svelte boundary, not content fetching or visitor reset. */
  reset?: () => void;
}

export type RenderError = Component<ComponentErrorProps>;

/**
 * Reports one render-time diagnostic (unregistered id, a component that
 * threw). `ServerExperienceRenderer` passes a closure that pushes onto a
 * plain array for synchronous traversal diagnostics. SSR component exceptions
 * are reported by the host's `transformError`, not the boundary's `onerror`.
 * `ClientExperienceRenderer`
 * passes a closure that mutates a `$state` array instead, so `<DebugExperience>`
 * re-renders reactively when a later interaction throws.
 */
export type DiagnosticReporter = (error: Error) => void;

export interface DebugExperienceProps {
  /** The resolved plan to inspect (what a renderer receives as `experience`). */
  experience: PortableRenderPlan;
  /** Start expanded. Defaults to collapsed to stay out of the way. */
  defaultOpen?: boolean;
  /**
   * Resolve-time + render-time diagnostics for this render, merged by the
   * caller (`ServerExperienceRenderer` / `ClientExperienceRenderer`). Plain
   * `Error`s — the two cases that wrap a real caught exception
   * (`component-render-error`, `resolve-data-failed`) set `.cause` to the
   * original error, inspectable via `console.error` or `error.cause.stack`.
   * Defaults to `[]` for a manually-mounted `<DebugExperience>`.
   */
  errors?: Error[];
}
