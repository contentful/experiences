/*
 * Throws unconditionally from its constructor — used to exercise
 * `component-render-error` isolation. A constructor throw is the earliest
 * possible failure point Angular gives a component, and it's what
 * `viewContainerRef.createComponent(...)` surfaces synchronously.
 */

import { Component } from '@angular/core';

@Component({
  selector: 'cf-broken-fixture',
  template: ``,
})
export class BrokenFixture {
  constructor() {
    throw new Error('boom');
  }
}
