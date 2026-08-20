/*
 * Fallback for a node whose component id is not in the registry. Port of
 * adapter-svelte/src/MissingComponent.svelte.
 *
 * Loud in the console always, visible on the page only in debug mode: a missing
 * registration is a developer mistake, and a red box in production would make it
 * the visitor's problem too.
 *
 * The warning fires from `ngOnInit` rather than the constructor because inputs
 * are not bound yet in the constructor, and rather than `afterNextRender`
 * because that never runs on the server — SSR would silently drop the
 * diagnostic. `ngOnInit` runs in both.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type OnInit,
  computed,
  signal,
} from '@angular/core';

import { injectExperience } from './context.js';

@Component({
  selector: 'cf-missing-component',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (experience().debug) {
      <div
        [attr.data-experiences-missing]="componentIdValue()"
        style="border: 2px solid red; padding: 1rem; color: red; background: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem;"
      >
        <strong>Missing component &#8216;{{ componentIdValue() }}&#8217;</strong>
        <p style="margin: 0.5rem 0;">
          This node references a component id that is not in the registry. Register it under this
          key in your <code>components</code> map:
        </p>
        <pre style="margin: 0; white-space: pre-wrap;">{{ details() }}</pre>
      </div>
    }
  `,
})
export class MissingComponentComponent implements OnInit {
  protected readonly componentIdValue = signal('');
  protected readonly nodeIdValue = signal<string | undefined>(undefined);

  @Input({ required: true }) set componentId(value: string) {
    this.componentIdValue.set(value);
  }

  @Input() set nodeId(value: string | undefined) {
    this.nodeIdValue.set(value);
  }

  protected readonly experience = injectExperience();

  protected readonly details = computed(() =>
    JSON.stringify(
      { componentId: this.componentIdValue(), nodeId: this.nodeIdValue() ?? null },
      null,
      2
    )
  );

  ngOnInit(): void {
    if (typeof console === 'undefined') return;
    const nodeId = this.nodeIdValue();
    const idLabel = nodeId ? ` (nodeId: ${nodeId})` : '';
    // No framework suffix on this one: it is identical across all adapters, and
    // customers grep for it.
    console.warn(
      `[@contentful/experiences] No component registered for id "${this.componentIdValue()}"${idLabel}.`
    );
  }
}
