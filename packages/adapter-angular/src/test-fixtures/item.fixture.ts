/* Port of adapter-svelte/src/test-fixtures/ItemFixture.svelte — proves registration defaults. */

import { Component, Input, signal } from '@angular/core';

@Component({
  selector: 'cf-item-fixture',
  template: `<span
    [attr.data-variant]="variantValue()"
    [attr.data-priority]="priorityValue()"
  ></span>`,
})
export class ItemFixture {
  protected readonly variantValue = signal<string | undefined>(undefined);
  protected readonly priorityValue = signal<string | undefined>(undefined);

  @Input() set variant(value: string | undefined) {
    this.variantValue.set(value);
  }

  @Input() set priority(value: string | undefined) {
    this.priorityValue.set(value);
  }
}
