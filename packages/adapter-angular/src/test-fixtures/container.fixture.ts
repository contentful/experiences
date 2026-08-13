/*
 * Port of adapter-svelte/src/test-fixtures/ContainerFixture.svelte.
 *
 * The Svelte twin iterates `children` and calls each snippet. Angular has no
 * snippet primitive, so the slot arrives as `PortableRenderNode[]` and the
 * fixture hands the whole array to the exported `<cf-nodes>`. Laziness is
 * identical either way: nothing in the array instantiates until `<cf-nodes>`
 * renders it.
 */

import { Component, Input, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { injectDesignValues } from '../inject-design-values.js';
import { NodesRendererComponent } from '../nodes-renderer.component.js';

@Component({
  selector: 'cf-container-fixture',
  imports: [NodesRendererComponent],
  template: `<div [attr.data-padding]="design().cfPadding">
    <cf-nodes [nodes]="childNodes()" />
  </div>`,
})
export class ContainerFixture {
  protected readonly childNodes = signal<PortableRenderNode[] | undefined>(undefined);
  protected readonly design = injectDesignValues<{ cfPadding?: unknown }>();

  @Input() set children(value: PortableRenderNode[] | undefined) {
    this.childNodes.set(value);
  }
}
