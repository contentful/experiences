/* Port of adapter-svelte/src/test-fixtures/PrecedenceFixture.svelte — one key, one attribute. */

import { Component, Input, signal } from '@angular/core';

@Component({
  selector: 'cf-precedence-fixture',
  template: `<span [attr.data-value]="valueValue()">{{ valueValue() }}</span>`,
})
export class PrecedenceFixture {
  protected readonly valueValue = signal<string | undefined>(undefined);

  @Input() set value(next: string | undefined) {
    this.valueValue.set(next);
  }
}
