/*
 * Port of adapter-svelte/src/test-fixtures/ContainerFixture.svelte.
 *
 * The Svelte twin iterates `children` and calls each snippet. Angular has no
 * snippet primitive, so the slot arrives as `PortableRenderNode[]` and the
 * fixture hands the whole array to the exported `*cfNodes`. Laziness is
 * identical either way: nothing in the array instantiates until `*cfNodes`
 * renders it.
 *
 * The children land as direct children of the `<div>` — a structural directive
 * has no host element, so the only trace of the adapter is a comment anchor.
 */

import { Component, Input, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { injectDesignValues } from '../inject-design-values.js';
import { NodesRendererDirective } from '../node-renderer.directive.js';

@Component({
  selector: 'cf-container-fixture',
  imports: [NodesRendererDirective],
  template: `<div [attr.data-padding]="design().cfPadding">
    <ng-container *cfNodes="childNodes()"></ng-container>
  </div>`,
})
export class ContainerFixture {
  protected readonly childNodes = signal<PortableRenderNode[] | undefined>(undefined);
  protected readonly design = injectDesignValues<{ cfPadding?: unknown }>();

  @Input() set children(value: PortableRenderNode[] | undefined) {
    this.childNodes.set(value);
  }
}
