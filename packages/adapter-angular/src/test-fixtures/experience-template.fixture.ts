/*
 * Port of adapter-svelte/src/test-fixtures/ExperienceTemplateFixture.svelte.
 *
 * `data-experience-template="page"` is hardcoded, exactly as in the Svelte twin:
 * the tests that assert its presence register this fixture under the id `page`,
 * and the tests that assert its *absence* only ever check for the attribute.
 * Rendering a named `content` slot rather than `children` is the point — slot
 * name → input name holds for experience templates too.
 */

import { Component, Input, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { injectDesignValues } from '../inject-design-values.js';
import { NodesRendererComponent } from '../nodes-renderer.component.js';

@Component({
  selector: 'cf-experience-template-fixture',
  imports: [NodesRendererComponent],
  template: `<main
    data-experience-template="page"
    [attr.data-title]="titleValue()"
    [attr.data-bg]="design().cfBackground"
  >
    <cf-nodes [nodes]="contentNodes()" />
  </main>`,
})
export class ExperienceTemplateFixture {
  protected readonly titleValue = signal<string | undefined>(undefined);
  protected readonly contentNodes = signal<PortableRenderNode[] | undefined>(undefined);
  protected readonly design = injectDesignValues<{ cfBackground?: unknown }>();

  @Input() set title(value: string | undefined) {
    this.titleValue.set(value);
  }

  @Input() set content(value: PortableRenderNode[] | undefined) {
    this.contentNodes.set(value);
  }
}
