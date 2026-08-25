/*
 * Experience-wide DI scope. The Angular analogue of the Svelte adapter's
 * `setExperience()` / `getExperience()` context pair.
 *
 * Both renderers provide this scope and connect it in their constructor, so
 * everything below them in the element-injector tree can reach the render
 * context, the registry, and the unknown-component renderer.
 *
 * Why three independent sources rather than one object: connecting them
 * separately keeps a viewport change (which only touches `experience`) from
 * invalidating readers of `config` or `renderUnknown`.
 *
 * Why getters rather than snapshots: a static `providers` array cannot see
 * instance inputs, and reading an input during construction is too early. A
 * scope therefore stores a *getter* that closes over the renderer's own
 * signals, and dereferences it lazily inside a `computed`. Reads stay reactive
 * for free, matching the Svelte adapter's `setResolvedDesign(() => …)`
 * contract.
 */

import { Injectable, type Signal, type Type, computed, signal } from '@angular/core';

import type { ExperienceDiagnostic } from '@contentful/experiences-sdk-core';

import type { Config, RenderContext } from './types.js';

@Injectable()
export class ExperienceScope {
  private readonly experienceSource = signal<(() => RenderContext) | null>(null);
  private readonly configSource = signal<(() => Config) | null>(null);
  private readonly renderUnknownSource = signal<(() => Type<unknown>) | null>(null);
  private readonly renderErrorSource = signal<(() => Type<unknown>) | null>(null);
  /**
   * Render-time diagnostics (unregistered id, a component that threw),
   * reported by every `NodeRenderEngine` sharing this scope — there is one
   * engine per `*cfNodes`/`*cfNode` directive instance, all connected to the
   * same scope, so this is the one place their reports converge. Signal-backed
   * rather than a plain array: `<cf-debug-experience>`'s `errors` input reads
   * it reactively, so — unlike the React/Svelte adapters, which need an
   * element-order trick or a `$state` mirror for this — nothing here depends
   * on template order.
   */
  private readonly diagnosticsSignal = signal<ExperienceDiagnostic[]>([]);

  readonly experience: Signal<RenderContext> = computed(() => {
    const read = this.experienceSource();
    if (!read) {
      throw new Error(
        '[@contentful/experiences-angular] ExperienceScope was read before a renderer connected it.'
      );
    }
    return read();
  });

  readonly config: Signal<Config> = computed(() => {
    const read = this.configSource();
    if (!read) {
      throw new Error(
        '[@contentful/experiences-angular] ExperienceScope was read before a renderer connected it.'
      );
    }
    return read();
  });

  readonly renderUnknown: Signal<Type<unknown>> = computed(() => {
    const read = this.renderUnknownSource();
    if (!read) {
      throw new Error(
        '[@contentful/experiences-angular] ExperienceScope was read before a renderer connected it.'
      );
    }
    return read();
  });

  readonly renderError: Signal<Type<unknown>> = computed(() => {
    const read = this.renderErrorSource();
    if (!read) {
      throw new Error(
        '[@contentful/experiences-angular] ExperienceScope was read before a renderer connected it.'
      );
    }
    return read();
  });

  readonly diagnostics: Signal<ExperienceDiagnostic[]> = this.diagnosticsSignal.asReadonly();

  connectExperience(read: () => RenderContext): void {
    this.experienceSource.set(read);
  }

  connectConfig(read: () => Config): void {
    this.configSource.set(read);
  }

  connectRenderUnknown(read: () => Type<unknown>): void {
    this.renderUnknownSource.set(read);
  }

  connectRenderError(read: () => Type<unknown>): void {
    this.renderErrorSource.set(read);
  }

  reportDiagnostic(diagnostic: ExperienceDiagnostic): void {
    this.diagnosticsSignal.update((prev) => [...prev, diagnostic]);
  }
}
