/*
 * A coded Experience Template that renders its own attributed scope ids from
 * `injectContentfulExperienceTemplate()`, then its `content` slot.
 */

import { Component, Input, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { injectContentfulExperienceTemplate } from '../context.js';
import { NodesRendererDirective } from '../node-renderer.directive.js';

@Component({
  selector: 'cf-attribution-template-probe-fixture',
  imports: [NodesRendererDirective],
  template: `<main data-template-scopes>
    {{ scopes() }}
    <ng-container *cfNodes="contentNodes()"></ng-container>
  </main>`,
})
export class AttributionTemplateProbeFixture {
  private readonly contentful = injectContentfulExperienceTemplate();
  protected readonly contentNodes = signal<PortableRenderNode[] | undefined>(undefined);

  protected scopes(): string {
    return (
      this.contentful()
        ?.attribution?.scopes.map((s) => s.entityId)
        .join(',') ?? ''
    );
  }

  @Input() set content(value: PortableRenderNode[] | undefined) {
    this.contentNodes.set(value);
  }
}
