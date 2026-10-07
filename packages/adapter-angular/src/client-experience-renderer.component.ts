/*
 * Browser entry point. Port of adapter-svelte/src/ClientExperienceRenderer.svelte.
 *
 * Browser entry point. Design values are resolved before this renderer receives
 * the plan, so it has no browser-only design-property work.
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

import { ComponentErrorComponent } from './component-error.component.js';
import { DebugExperienceComponent } from './debug-experience.component.js';
import { DEFAULT_CONTEXT, EMPTY_CONFIG } from './experience-defaults.js';
import { ExperienceScope } from './experience-scope.js';
import { MissingComponentComponent } from './missing-component.component.js';
import { NodesRendererDirective } from './node-renderer.directive.js';
import type { Config, RenderContext } from './types.js';

@Component({
  selector: 'cf-experience',
  imports: [DebugExperienceComponent, NodesRendererDirective],
  providers: [ExperienceScope],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The `<cf-experience>` host element itself stays a real element — it is the
  // customer's mount point, and they may well style it. Only the plumbing
  // *inside* it is anchor-only: `*cfNodes` puts the top-level nodes here as
  // siblings of a comment, so nothing the adapter owns wraps them.
  //
  // See the matching note in server-experience-renderer.component.ts on why
  // the node tree renders before `<cf-debug-experience>`.
  template: `
    @if (experienceValue(); as experience) {
      <ng-container *cfNodes="experience.nodes"></ng-container>
      @if (resolvedDebug()) {
        <cf-debug-experience [experience]="experience" [errors]="errors()" />
      }
    }
  `,
})
export class ClientExperienceRendererComponent {
  protected readonly experienceValue = signal<PortableRenderPlan | null>(null);
  // `undefined` means "not bound", distinct from an explicit `[debug]="false"`.
  private readonly debugValue = signal<boolean | undefined>(undefined);
  protected readonly resolvedDebug = computed(
    () => this.debugValue() ?? this.experienceValue()?.debug ?? false
  );
  private readonly configValue = signal<Config | null>(null);
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

  /** Shallow-merges over the plan's `metadata`. Only needed to override it. */
  @Input() set metadata(value: Record<string, unknown> | undefined) {
    this.metadataValue.set(value);
  }

  /**
   * Renders the resolved plan above the experience for inspection. Defaults to
   * the plan's `debug`; `[debug]="false"` overrides a debug-on plan.
   */
  @Input() set debug(value: boolean | undefined) {
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

  private readonly renderContext = computed<RenderContext>(() => {
    const experience = this.experienceValue();
    return {
      ...DEFAULT_CONTEXT,
      debug: this.resolvedDebug(),
      metadata: {
        ...DEFAULT_CONTEXT.metadata,
        ...(experience?.metadata ?? {}),
        ...(this.metadataValue() ?? {}),
      },
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
