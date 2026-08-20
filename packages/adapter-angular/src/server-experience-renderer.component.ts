/*
 * Server-side entry point. Port of adapter-svelte/src/ServerExperienceRenderer.svelte.
 *
 * Resolves the active viewport once, from `initialViewportId`, and never
 * reconsiders — no `matchMedia`, no listeners, nothing that touches `window`.
 * Use it wherever the render happens outside a browser: an `@angular/ssr` server
 * route, a prerender, an email or PDF pipeline.
 *
 * For a browser render that should follow viewport changes, use
 * `<cf-experience>` instead. The two are mutually exclusive: SSR cannot react to
 * a viewport the server cannot observe.
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

import { getViewportIndex } from '@contentful/experiences-design';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DebugExperienceComponent } from './debug-experience.component.js';
import { DEFAULT_CONTEXT, EMPTY_CONFIG, FALLBACK_VIEWPORT } from './experience-defaults.js';
import { ExperienceScope } from './experience-scope.js';
import { MissingComponentComponent } from './missing-component.component.js';
import { NodesRendererDirective } from './node-renderer.directive.js';
import type { Config, RenderContext } from './types.js';

@Component({
  selector: 'cf-server-experience',
  imports: [DebugExperienceComponent, NodesRendererDirective],
  providers: [ExperienceScope],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The `<cf-server-experience>` host element itself stays a real element — it is
  // the customer's mount point, and they may well style it. Only the plumbing
  // *inside* it is anchor-only: `*cfNodes` puts the top-level nodes here as
  // siblings of a comment, so nothing the adapter owns wraps them.
  template: `
    @if (experienceValue(); as experience) {
      @if (debugValue()) {
        <cf-debug-experience [experience]="experience" />
      }
      <ng-container *cfNodes="experience.nodes"></ng-container>
    }
  `,
})
export class ServerExperienceRendererComponent {
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
   * Viewport to render for, typically derived from the request's User-Agent.
   * Falls back to the plan's fallback viewport when unset or unknown.
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

  /**
   * A `computed`, not a one-shot build: on the server it evaluates once and
   * caches, but the same class is cheap to keep correct if inputs do change
   * (a test harness rebinding, a resolved plan arriving late).
   */
  private readonly renderContext = computed<RenderContext>(() => {
    const experience = this.experienceValue();
    const activeViewportIndex = experience
      ? getViewportIndex(experience.viewports, this.initialViewportIdValue())
      : 0;
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
