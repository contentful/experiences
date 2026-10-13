import { Component } from '@angular/core';

import { injectContentfulComponent } from '../context.js';

@Component({
  selector: 'cf-attribution-probe-fixture',
  template: `<span data-scopes [attr.data-json]="json()">{{ scopes() }}</span>`,
})
export class AttributionProbeFixture {
  private readonly contentful = injectContentfulComponent();

  protected json(): string {
    return JSON.stringify(this.contentful()?.attribution ?? null);
  }

  protected scopes(): string {
    return (
      this.contentful()
        ?.attribution?.scopes.map((s) => s.entityId)
        .join(',') ?? ''
    );
  }
}
