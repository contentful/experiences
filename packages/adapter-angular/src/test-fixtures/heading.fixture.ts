/* Port of adapter-svelte/src/test-fixtures/HeadingFixture.svelte. */

import { Component, Input, signal } from '@angular/core';

import { injectDesignValues } from '../inject-design-values.js';

@Component({
  selector: 'cf-heading-fixture',
  template: `<h1 [attr.data-font-size]="design().cfFontSize">{{ textValue() }}</h1>`,
})
export class HeadingFixture {
  protected readonly textValue = signal<string | undefined>(undefined);
  protected readonly design = injectDesignValues<{ cfFontSize?: unknown }>();

  @Input() set text(value: string | undefined) {
    this.textValue.set(value);
  }
}
