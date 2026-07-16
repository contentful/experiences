/*
 * Svelte context keys + helpers that expose runtime context and the raw
 * Contentful payload to descendants of a rendered Experience. Customer
 * components receive only their declared props via the renderer; anything
 * that needs the Experience runtime context or the underlying payload calls
 * the helper from the top of its `<script>` block.
 *
 * Reactivity: the client renderer stores a `$state` proxy in context, so
 * reads through the returned object (`exp.activeViewport`, from the
 * template or a `$derived`) stay reactive across viewport changes.
 * Destructuring the return of `getExperience()` loses that reactivity —
 * same rule as Svelte 5 `$props()`.
 *
 * `getContext` / `setContext` must be called during synchronous component
 * initialization (top of the `<script>` block), not inside async callbacks
 * or event handlers.
 */

import { getContext, setContext } from 'svelte';

import type { ContentfulComponent, ContentfulTemplate, RenderContext } from './types.js';

const EXPERIENCE_KEY = Symbol('@contentful/experiences-svelte::experience');
const COMPONENT_KEY = Symbol('@contentful/experiences-svelte::contentful-component');
const TEMPLATE_KEY = Symbol('@contentful/experiences-svelte::contentful-template');
const RESOLVED_DESIGN_KEY = Symbol('@contentful/experiences-svelte::resolved-design');

export function setExperience(ctx: RenderContext): void {
  setContext(EXPERIENCE_KEY, ctx);
}

export function setContentfulComponent(node: ContentfulComponent): void {
  setContext(COMPONENT_KEY, node);
}

export function setContentfulTemplate(tpl: ContentfulTemplate): void {
  setContext(TEMPLATE_KEY, tpl);
}

/**
 * Publish the design values the renderer already resolved (viewport-cascaded
 * + token-resolved) for the enclosing node/template. Takes a getter rather
 * than a snapshot so a caller reading it inside a `$derived` stays reactive
 * across viewport changes — the getter re-reads the renderer's `$derived`
 * each call. Plain data only crosses here, never the Config or its functions.
 */
export function setResolvedDesign(getDesign: () => Record<string, unknown>): void {
  setContext(RESOLVED_DESIGN_KEY, getDesign);
}

export function getExperience(): RenderContext {
  const ctx = getContext<RenderContext | undefined>(EXPERIENCE_KEY);
  if (!ctx) {
    throw new Error(
      'getExperience() must be called inside a <ServerExperienceRenderer> or <ClientExperienceRenderer> subtree.'
    );
  }
  return ctx;
}

export function getContentfulComponent(): ContentfulComponent | undefined {
  return getContext<ContentfulComponent | undefined>(COMPONENT_KEY);
}

export function getContentfulTemplate(): ContentfulTemplate | undefined {
  return getContext<ContentfulTemplate | undefined>(TEMPLATE_KEY);
}

/**
 * Read the design values the renderer resolved for the enclosing node or
 * template. Returns `undefined` outside a rendered node/template, which
 * `getDesignValues` treats as "nothing to read."
 */
export function getResolvedDesign(): Record<string, unknown> | undefined {
  const getDesign = getContext<(() => Record<string, unknown>) | undefined>(RESOLVED_DESIGN_KEY);
  return getDesign?.();
}
