/*
 * Port of adapter-svelte/src/test-fixtures/WrappingContainerFixture.svelte.
 *
 * Wraps each slot child in its own element to prove the slot arrives as an
 * addressable, per-child collection rather than one opaque blob — a customer can
 * interleave markup between children. `*cfNode` (singular) is what makes that
 * possible; `*cfNodes` is just the loop over it.
 *
 * No `designValues` on the capture, matching the Svelte twin.
 */

import { Component, Input, type OnInit, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { injectContentfulComponent, injectExperience } from '../context.js';
import { NodeRendererDirective } from '../node-renderer.directive.js';
import { captureSink } from './capture-sink.js';

@Component({
  selector: 'cf-wrapping-container-fixture',
  imports: [NodeRendererDirective],
  template: `<div data-container>
    @for (child of childNodes() ?? []; track $index) {
      <div class="wrap" [attr.data-index]="$index">
        <ng-container *cfNode="child"></ng-container>
      </div>
    }
  </div>`,
})
export class WrappingContainerFixture implements OnInit {
  protected readonly childNodes = signal<PortableRenderNode[] | undefined>(undefined);

  private readonly experienceContext = injectExperience();
  private readonly contentfulNode = injectContentfulComponent();

  @Input() set children(value: PortableRenderNode[] | undefined) {
    this.childNodes.set(value);
  }

  ngOnInit(): void {
    const children = this.childNodes();
    captureSink.push({
      props: {
        childCount: children?.length ?? 0,
        childrenIsArray: Array.isArray(children),
      },
      experience: this.experienceContext(),
      contentful: this.contentfulNode(),
    });
  }
}
