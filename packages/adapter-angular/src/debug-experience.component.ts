/*
 * Collapsible dump of the resolved render plan. Port of
 * adapter-svelte/src/DebugExperience.svelte.
 *
 * Rendered by either experience renderer when `debug` is on. Answers "what did
 * the resolver actually produce?" without a devtools round-trip — which matters
 * most under SSR, where the plan never reaches the browser as data.
 */

import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

import type { ExperienceDiagnostic, PortableRenderPlan } from '@contentful/experiences-sdk-core';

/**
 * `JSON.stringify` with the sharp edges filed off: render plans can carry
 * circular references (a resolved entry linking back to its parent) and function
 * values (a `resolveData` result), either of which would throw or silently vanish.
 * A debug panel that crashes the page is worse than no debug panel.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === 'function') {
          return `[Function ${(val as { name?: string }).name || 'anonymous'}]`;
        }
        if (val === undefined) return '[undefined]';
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      },
      2
    );
  } catch (err) {
    return `[DebugExperience: could not serialize plan — ${(err as Error).message}]`;
  }
}

@Component({
  selector: 'cf-debug-experience',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details
      [open]="open()"
      data-experiences-debug
      style="margin: 1rem 0; border: 1px solid #6b7280; border-radius: 6px; background: #0b1021; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; overflow: hidden;"
    >
      <summary
        style="cursor: pointer; padding: 0.5rem 0.75rem; background: #111827; user-select: none;"
      >
        {{ summary() }}
      </summary>
      <!-- Deliberately unstyled — visual treatment is AIS-407's job. This
           just needs to make the data visible, not console-only. -->
      @if (errorsValue().length > 0) {
        <ul data-experiences-debug-errors>
          @for (diagnostic of errorsValue(); track $index) {
            <li [attr.data-experiences-debug-error-code]="diagnostic.code">
              {{ diagnostic.severity }} · {{ diagnostic.code }}: {{ diagnostic.message }}
            </li>
          }
        </ul>
      }
      <pre
        style="margin: 0; padding: 0.75rem; overflow: auto; max-height: 32rem; white-space: pre-wrap; word-break: break-word;"
        >{{ json() }}</pre>
    </details>
  `,
})
export class DebugExperienceComponent {
  protected readonly experienceValue = signal<PortableRenderPlan | null>(null);
  protected readonly defaultOpenValue = signal(false);
  protected readonly errorsValue = signal<ExperienceDiagnostic[]>([]);

  @Input({ required: true }) set experience(value: PortableRenderPlan) {
    this.experienceValue.set(value);
  }

  @Input() set defaultOpen(value: boolean) {
    this.defaultOpenValue.set(value);
  }

  /** Resolve-time + render-time diagnostics, merged by the caller. */
  @Input() set errors(value: ExperienceDiagnostic[] | undefined) {
    this.errorsValue.set(value ?? []);
  }

  // Auto-expand whenever there's something to see, even if the caller didn't
  // explicitly ask — a beta customer shouldn't have to know to click into a
  // collapsed panel to discover that something went wrong.
  protected readonly open = computed(
    () => this.defaultOpenValue() || this.errorsValue().length > 0
  );

  protected readonly summary = computed(() => {
    const experience = this.experienceValue();
    if (!experience) return 'Experience debug';
    const nodeCount = experience.nodes.length;
    const templateIds = experience.nodes
      .filter((node) => node.registration.kind === 'experienceTemplate')
      .map((node) => node.registration.id);
    const templatePart = templateIds.length
      ? `, experience template${templateIds.length === 1 ? '' : 's'}: ${templateIds.join(', ')}`
      : '';
    return `Experience debug — ${nodeCount} top-level node${nodeCount === 1 ? '' : 's'}${templatePart}`;
  });

  protected readonly json = computed(() => safeStringify(this.experienceValue()));
}
