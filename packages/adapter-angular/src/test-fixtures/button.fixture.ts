/*
 * Port of adapter-svelte/src/test-fixtures/ButtonFixture.svelte.
 *
 * Reads its background through `injectDesignValues()` rather than declaring a
 * `cfBackgroundColor` input, which is what makes it useful for the no-resolver
 * test: an unresolved `DesignToken` object reaches the attribute binding and
 * stringifies to `[object Object]`, matching Svelte.
 */

import { Component, Input, signal } from '@angular/core';

import { injectDesignValues } from '../inject-design-values.js';

@Component({
  selector: 'cf-button-fixture',
  template: `<button type="button" [attr.data-bg]="design().cfBackgroundColor">
    {{ labelValue() }}
  </button>`,
})
export class ButtonFixture {
  protected readonly labelValue = signal<string | undefined>(undefined);
  protected readonly design = injectDesignValues<{ cfBackgroundColor?: unknown }>();

  @Input() set label(value: string | undefined) {
    this.labelValue.set(value);
  }
}
