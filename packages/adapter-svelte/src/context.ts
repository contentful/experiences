/*
 * Svelte context keys + helpers for runtime escape hatches.
 *
 * The renderer no longer injects `experience` / `contentful` as props onto
 * customer components. Components stay plain Svelte with their own prop
 * type and receive only the merged content / design / resolveData / slot
 * Snippet prop bag.
 *
 * When a component needs the runtime context or the raw Contentful payload,
 * it calls the helper explicitly. This makes the coupling visible at the
 * call site and keeps unused-context components free of extra props.
 *
 * Reactivity: the renderer stores a `$state` proxy in context, so reads
 * through the returned object (`exp.activeViewport`, in template or in a
 * `$derived`) stay reactive across client viewport changes. Calling
 * `getExperience()` once and destructuring loses that reactivity — same
 * rule as Svelte 5 `$props()`.
 *
 * NOTE: `getContext` / `setContext` must be called during synchronous
 * component initialization (top of the `<script>` block), not inside async
 * callbacks or event handlers.
 */

import { getContext, setContext } from 'svelte';

import type { ContentfulComponent, ContentfulTemplate, RenderContext } from './types.js';

const EXPERIENCE_KEY = Symbol('@contentful/experiences-svelte::experience');
const COMPONENT_KEY = Symbol('@contentful/experiences-svelte::contentful-component');
const TEMPLATE_KEY = Symbol('@contentful/experiences-svelte::contentful-template');

export function setExperience(ctx: RenderContext): void {
  setContext(EXPERIENCE_KEY, ctx);
}

export function setContentfulComponent(node: ContentfulComponent): void {
  setContext(COMPONENT_KEY, node);
}

export function setContentfulTemplate(tpl: ContentfulTemplate): void {
  setContext(TEMPLATE_KEY, tpl);
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
