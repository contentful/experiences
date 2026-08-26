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

import { ComponentErrorComponent } from './component-error.component.js';
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
  //
  // The node tree renders before `<cf-debug-experience>` here for consistency
  // with the React adapter's element-order fix — Angular's own reactivity
  // (`errors` is a signal read at template-check time) doesn't strictly
  // require this ordering the way React's synchronous single-pass render
  // does, but matching it keeps the three adapters' templates readable
  // side-by-side.
  template: `
    @if (experienceValue(); as experience) {
      <ng-container *cfNodes="experience.nodes"></ng-container>
      @if (debugValue()) {
        <cf-debug-experience [experience]="experience" [errors]="errors()" />
      }
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
  private readonly renderErrorValue = signal<Type<unknown>>(ComponentErrorComponent);

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

  /** Replaces the default error box rendered when a registered component throws. */
  @Input() set renderError(value: Type<unknown> | undefined) {
    this.renderErrorValue.set(value ?? ComponentErrorComponent);
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

  private readonly scope = inject(ExperienceScope);

  /** Resolve-time + render-time diagnostics, merged for `<cf-debug-experience>`. */
  protected readonly errors = computed<Error[]>(() => [
    ...(this.experienceValue()?.diagnostics ?? []),
    ...this.scope.diagnostics(),
  ]);

  constructor() {
    this.scope.connectExperience(() => this.renderContext());
    this.scope.connectConfig(() => this.configValue() ?? EMPTY_CONFIG);
    this.scope.connectRenderUnknown(() => this.renderUnknownValue());
    this.scope.connectRenderError(() => this.renderErrorValue());
  }
}
