/*
 * Browser entry point. Port of adapter-svelte/src/ClientExperienceRenderer.svelte.
 *
 * Identical to `<cf-server-experience>` except that the active viewport tracks
 * `window.matchMedia` instead of being fixed at render time, so design values
 * re-cascade as the window resizes.
 *
 * Simpler than the Svelte original: Svelte mutates a `$state` object in place
 * because its contexts are snapshots, so the mirror and the `$effect` that keeps
 * it in sync are load-bearing there. Angular signals have no such constraint —
 * one `computed` is the whole thing.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type Type,
  computed,
  inject,
  signal,
} from '@angular/core';

import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DebugExperienceComponent } from './debug-experience.component.js';
import { DEFAULT_CONTEXT, EMPTY_CONFIG, FALLBACK_VIEWPORT } from './experience-defaults.js';
import { ExperienceScope } from './experience-scope.js';
import { injectActiveViewport } from './inject-active-viewport.js';
import { MissingComponentComponent } from './missing-component.component.js';
import { NodesRendererComponent } from './nodes-renderer.component.js';
import type { Config, RenderContext } from './types.js';

@Component({
  selector: 'cf-experience',
  imports: [DebugExperienceComponent, NodesRendererComponent],
  providers: [ExperienceScope],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (experienceValue(); as experience) {
      @if (debugValue()) {
        <cf-debug-experience [experience]="experience" />
      }
      <cf-nodes [nodes]="experience.nodes" />
    }
  `,
})
export class ClientExperienceRendererComponent {
  protected readonly experienceValue = signal<PortableRenderPlan | null>(null);
  protected readonly debugValue = signal(false);
  private readonly configValue = signal<Config | null>(null);
  private readonly initialViewportIdValue = signal<string | undefined>(undefined);
  private readonly metadataValue = signal<Record<string, unknown> | undefined>(undefined);
  private readonly renderUnknownValue = signal<Type<unknown>>(MissingComponentComponent);

  /** A resolved render plan, or `null` while one is still being fetched. */
  @Input({ required: true }) set experience(value: PortableRenderPlan | null | undefined) {
    this.experienceValue.set(value ?? null);
  }

  @Input({ required: true }) set config(value: Config) {
    this.configValue.set(value);
  }

  /**
   * Viewport to render for until `matchMedia` takes over after the first render.
   * Set it to whatever the server rendered with so hydration does not flicker.
   */
  @Input() set initialViewportId(value: string | undefined) {
    this.initialViewportIdValue.set(value);
  }

  /** Arbitrary values passed through to descendants via `injectExperience()`. */
  @Input() set metadata(value: Record<string, unknown> | undefined) {
    this.metadataValue.set(value);
  }

  /** Renders the resolved plan above the experience for inspection. */
  @Input() set debug(value: boolean) {
    this.debugValue.set(value);
  }

  /** Replaces the default missing-component box. Receives `componentId` and `nodeId`. */
  @Input() set renderUnknown(value: Type<unknown> | undefined) {
    this.renderUnknownValue.set(value ?? MissingComponentComponent);
  }

  // Getters, not values: this runs during construction, before Angular has bound
  // a single input. See injectActiveViewport's docblock.
  private readonly tracker = injectActiveViewport(
    () => this.experienceValue()?.viewports ?? [],
    () => this.initialViewportIdValue()
  );

  private readonly renderContext = computed<RenderContext>(() => {
    const experience = this.experienceValue();
    const activeViewportIndex = this.tracker.activeViewportIndex();
    return {
      ...DEFAULT_CONTEXT,
      debug: this.debugValue(),
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(this.metadataValue() ?? {}) },
      viewports: experience?.viewports ?? [],
      activeViewport: experience?.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT,
      activeViewportIndex,
      fallbackViewportIndex: experience?.fallbackViewportIndex ?? 0,
    };
  });

  constructor() {
    const scope = inject(ExperienceScope);
    scope.connectExperience(() => this.renderContext());
    scope.connectConfig(() => this.configValue() ?? EMPTY_CONFIG);
    scope.connectRenderUnknown(() => this.renderUnknownValue());
  }
}
