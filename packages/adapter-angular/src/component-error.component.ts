/*
 * Fallback for a node whose registered component threw while rendering. Port
 * of adapter-svelte/src/ComponentError.svelte — sibling of `MissingComponentComponent`
 * with the same debug-gated behavior (visible box in debug mode, silent
 * otherwise), visually distinct so "not registered" reads differently from
 * "registered but threw". The diagnostic + console.warn for this failure
 * mode are recorded once, at the catch site in `node-render-engine.ts` — not
 * here — so they still fire even when a customer overrides `renderError`
 * with their own fallback.
 */

import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

import { injectExperience } from './context.js';

@Component({
  selector: 'cf-component-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (experience().debug) {
      <div
        [attr.data-experiences-render-error]="componentIdValue()"
        style="border: 2px solid #b91c1c; padding: 1rem; color: #b91c1c; background: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem;"
      >
        <strong>Component &#8216;{{ componentIdValue() }}&#8217; threw while rendering</strong>
        <p style="margin: 0.5rem 0;">
          This component is registered but threw during render. Rendering this fallback instead of
          crashing the surrounding tree.
        </p>
        <pre style="margin: 0; white-space: pre-wrap;">{{ details() }}</pre>
      </div>
    }
  `,
})
export class ComponentErrorComponent {
  protected readonly componentIdValue = signal('');
  protected readonly nodeIdValue = signal<string | undefined>(undefined);
  protected readonly messageValue = signal<string | undefined>(undefined);

  @Input({ required: true }) set componentId(value: string) {
    this.componentIdValue.set(value);
  }

  @Input() set nodeId(value: string | undefined) {
    this.nodeIdValue.set(value);
  }

  @Input() set message(value: string | undefined) {
    this.messageValue.set(value);
  }

  protected readonly experience = injectExperience();

  protected readonly details = computed(() =>
    JSON.stringify(
      {
        componentId: this.componentIdValue(),
        nodeId: this.nodeIdValue() ?? null,
        message: this.messageValue() ?? null,
      },
      null,
      2
    )
  );
}
