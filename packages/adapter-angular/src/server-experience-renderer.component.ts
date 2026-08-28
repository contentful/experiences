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
      @if (resolvedDebug()) {
        <cf-debug-experience [experience]="experience" />
      }
      <ng-container *cfNodes="experience.nodes"></ng-container>
    }
  `,
})
export class ServerExperienceRendererComponent {
  protected readonly experienceValue = signal<PortableRenderPlan | null>(null);
  // `undefined` means "not bound" — distinct from an explicit `[debug]="false"`,
  // which must be able to override a plan fetched with debug on.
  private readonly debugValue = signal<boolean | undefined>(undefined);
  /** The plan is the source of truth; the input overrides it. */
  protected readonly resolvedDebug = computed(
    () => this.debugValue() ?? this.experienceValue()?.debug ?? false
  );
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
   *
   * Defaults to the viewport the plan was pre-resolved against
   * (`fallbackViewportIndex`), so binding the same id on `fetchExperience` is
   * enough — first paint then matches the pre-resolved design with no
   * recompute. Bind this to render a different viewport than the design was
   * resolved for.
   */
  @Input() set initialViewportId(value: string | undefined) {
    this.initialViewportIdValue.set(value);
  }

  /**
   * Per-render metadata override. The plan already carries whatever `metadata`
   * the fetch ran with; this shallow-merges over it.
   */
  @Input() set metadata(value: Record<string, unknown> | undefined) {
    this.metadataValue.set(value);
  }

  /**
   * Renders the resolved plan above the experience for inspection.
   *
   * Defaults to the `debug` the fetch ran with (carried on the plan). Bind it
   * explicitly to override — `[debug]="false"` switches off a plan fetched with
   * debug on.
   */
  @Input() set debug(value: boolean | undefined) {
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
    const initialViewportId = this.initialViewportIdValue();
    // No explicit seed means "whatever the plan was pre-resolved for" — keeps
    // first paint aligned with `props.design` instead of recomputing.
    const activeViewportIndex = !experience
      ? 0
      : initialViewportId === undefined
        ? experience.fallbackViewportIndex
        : getViewportIndex(experience.viewports, initialViewportId);
    return {
      ...DEFAULT_CONTEXT,
      debug: this.resolvedDebug(),
      metadata: {
        ...DEFAULT_CONTEXT.metadata,
        ...(experience?.metadata ?? {}),
        ...(this.metadataValue() ?? {}),
      },
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
