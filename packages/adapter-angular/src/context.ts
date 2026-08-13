/*
 * Accessors that expose runtime context and the raw Contentful payload to
 * descendants of a rendered Experience. Customer components receive only their
 * declared inputs from the renderer; anything that needs the Experience runtime
 * context or the underlying payload injects it here.
 *
 * Reactivity: every accessor returns a `Signal`, so reads from a template or a
 * `computed()` stay live across viewport changes. Call the signal at the point
 * of use — capturing `injectExperience()()` once loses reactivity, the same rule
 * as any other signal read.
 *
 * Like every `inject()`-based API these must be called from an injection context
 * — a field initializer or the constructor — not from a lifecycle hook or an
 * event handler.
 */

import { type Signal, inject, signal } from '@angular/core';

import { ExperienceScope } from './experience-scope.js';
import { ComponentScope, ExperienceTemplateScope } from './node-scopes.js';
import type { ContentfulComponent, ContentfulExperienceTemplate, RenderContext } from './types.js';

// Module-scope constants rather than a fresh signal per call: the value can
// never change, so readers should never be invalidated. Real signals, not
// stub functions — consumers may pass these through APIs that call `isSignal()`.
const EMPTY_COMPONENT = signal<ContentfulComponent | undefined>(undefined).asReadonly();
const EMPTY_EXPERIENCE_TEMPLATE = signal<ContentfulExperienceTemplate | undefined>(
  undefined
).asReadonly();

/**
 * Render-time experience context: viewports, active viewport, metadata, debug.
 * Throws outside a renderer subtree — reading experience context where there is
 * no experience is a programming error, not a state to branch on.
 */
export function injectExperience(): Signal<RenderContext> {
  const scope = inject(ExperienceScope, { optional: true });
  if (!scope) {
    throw new Error(
      'injectExperience() must be called inside a <cf-server-experience> or <cf-experience> subtree.'
    );
  }
  return scope.experience;
}

/**
 * Raw Contentful payload for the nearest enclosing component node. Returns a
 * signal of `undefined` outside a rendered component node.
 */
export function injectContentfulComponent(): Signal<ContentfulComponent | undefined> {
  const scope = inject(ComponentScope, { optional: true });
  return scope ? scope.node : EMPTY_COMPONENT;
}

/**
 * Raw Contentful payload for the nearest enclosing experience template node.
 * Resolves through the element-injector walk-up, so a component nested inside a
 * template still reaches the template's payload. Returns a signal of `undefined`
 * outside a rendered experience template.
 */
export function injectContentfulExperienceTemplate(): Signal<
  ContentfulExperienceTemplate | undefined
> {
  const scope = inject(ExperienceTemplateScope, { optional: true });
  return scope ? scope.template : EMPTY_EXPERIENCE_TEMPLATE;
}
