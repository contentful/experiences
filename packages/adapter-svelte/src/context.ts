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

import type { ContentfulComponent, ContentfulExperienceTemplate, RenderContext } from './types.js';

const EXPERIENCE_KEY = Symbol('@contentful/experiences-svelte::experience');
const COMPONENT_KEY = Symbol('@contentful/experiences-svelte::contentful-component');
const EXPERIENCE_TEMPLATE_KEY = Symbol(
  '@contentful/experiences-svelte::contentful-experience-template'
);
const RESOLVED_DESIGN_KEY = Symbol('@contentful/experiences-svelte::resolved-design');

export function setExperience(ctx: RenderContext): void {
  setContext(EXPERIENCE_KEY, ctx);
}

export function setContentfulComponent(node: ContentfulComponent): void {
  setContext(COMPONENT_KEY, node);
}

export function setContentfulExperienceTemplate(tpl: ContentfulExperienceTemplate): void {
  setContext(EXPERIENCE_TEMPLATE_KEY, tpl);
}

/**
 * Publish the resolved design values for the enclosing node or experience template. Takes a
 * getter (not a snapshot) so callers reading it inside a `$derived` stay
 * reactive across viewport changes.
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

export function getContentfulExperienceTemplate(): ContentfulExperienceTemplate | undefined {
  return getContext<ContentfulExperienceTemplate | undefined>(EXPERIENCE_TEMPLATE_KEY);
}

/**
 * Read the design values the renderer resolved for the enclosing node or
 * experience template. Returns `undefined` outside a rendered node or
 * experience template, which
 * `getDesignValues` treats as "nothing to read."
 */
export function getResolvedDesign(): Record<string, unknown> | undefined {
  const getDesign = getContext<(() => Record<string, unknown>) | undefined>(RESOLVED_DESIGN_KEY);
  return getDesign?.();
}
