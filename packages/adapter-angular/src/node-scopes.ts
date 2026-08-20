/*
 * Per-node DI scopes — the Angular analogue of the Svelte adapter's
 * `setContentfulComponent()` / `setContentfulExperienceTemplate()` /
 * `setResolvedDesign()` context writes.
 *
 * Three separate `@Injectable()` classes, deliberately never collapsed into one
 * per-node object. Angular resolves providers by walking *up* the element
 * injector tree, so a component node nested inside an experience template
 * provides `ComponentScope` + `DesignScope` while leaving
 * `ExperienceTemplateScope` unshadowed — the walk-up then reaches the enclosing
 * template's scope. A single combined scope would shadow it and break that
 * lookup.
 *
 * Each scope stores a getter rather than a snapshot, for the reasons documented
 * in experience-scope.ts.
 */

import { Injectable, type Signal, computed, signal } from '@angular/core';

import type { ContentfulComponent, ContentfulExperienceTemplate } from './types.js';

/**
 * Viewport-cascaded, token-resolved design values for the enclosing node.
 * Provided on every rendered node, so `injectDesignValues()` always reads the
 * nearest one.
 */
@Injectable()
export class DesignScope {
  private readonly source = signal<(() => Record<string, unknown>) | null>(null);

  readonly resolvedDesign: Signal<Record<string, unknown>> = computed(
    () => this.source()?.() ?? {}
  );

  connect(read: () => Record<string, unknown>): void {
    this.source.set(read);
  }
}

/**
 * Raw Contentful payload for the enclosing component node.
 *
 * The getter may return `undefined`: a wrapper connects the scope from its
 * constructor, before Angular has bound its `node` input. Nothing inside the
 * node's subtree exists yet at that point, so the gap is unobservable — but it
 * is real, and typing it away would need a lie.
 */
@Injectable()
export class ComponentScope {
  private readonly source = signal<(() => ContentfulComponent | undefined) | null>(null);

  readonly node: Signal<ContentfulComponent | undefined> = computed(() => this.source()?.());

  connect(read: () => ContentfulComponent | undefined): void {
    this.source.set(read);
  }
}

/** Raw Contentful payload for the enclosing experience template node. */
@Injectable()
export class ExperienceTemplateScope {
  private readonly source = signal<(() => ContentfulExperienceTemplate | undefined) | null>(null);

  readonly template: Signal<ContentfulExperienceTemplate | undefined> = computed(() =>
    this.source()?.()
  );

  connect(read: () => ContentfulExperienceTemplate | undefined): void {
    this.source.set(read);
  }
}
