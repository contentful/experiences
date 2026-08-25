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

import type { ExperienceDiagnostic, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import type { Config } from './types.js';

export interface ServerExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  initialViewportId?: string;
  /**
   * Arbitrary per-render metadata, readable by descendants via
   * `getExperience()` and by resolvers via `ctx.experience.metadata`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree.
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
  /** The caught error's message, when available. */
  message?: string;
}

export type RenderError = Component<ComponentErrorProps>;

/**
 * Reports one render-time diagnostic (unregistered id, a component that
 * threw). `ServerExperienceRenderer` passes a closure that pushes onto a
 * plain array (Svelte SSR is synchronous top-down, so the array is fully
 * populated by the time `<DebugExperience>` reads it). `ClientExperienceRenderer`
 * passes a closure that mutates a `$state` array instead, so `<DebugExperience>`
 * re-renders reactively when a later interaction throws.
 */
export type DiagnosticReporter = (diagnostic: ExperienceDiagnostic) => void;

export interface DebugExperienceProps {
  /** The resolved plan to inspect (what a renderer receives as `experience`). */
  experience: PortableRenderPlan;
  /** Start expanded. Defaults to collapsed to stay out of the way. */
  defaultOpen?: boolean;
  /**
   * Resolve-time + render-time diagnostics for this render, merged by the
   * caller (`ServerExperienceRenderer` / `ClientExperienceRenderer`).
   * Defaults to `[]` for a manually-mounted `<DebugExperience>`.
   */
  errors?: ExperienceDiagnostic[];
}
