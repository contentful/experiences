/*
 * Renders a list of IR nodes. Port of adapter-svelte/src/NodesRenderer.svelte,
 * minus the snippet machinery: Angular has no lazy renderable-child primitive
 * that supports arbitrary named slots, so slots reach customer components as
 * plain `PortableRenderNode[]` inputs and get rendered back through this
 * component.
 *
 * That makes `<cf-nodes>` load-bearing public API in the Angular adapter rather
 * than the advanced escape hatch it is in Svelte:
 *
 *   @Component({
 *     imports: [NodesRendererComponent],
 *     template: `<cf-nodes [nodes]="children" />`,
 *   })
 *   export class ContainerComponent {
 *     @Input() children: PortableRenderNode[] = [];
 *   }
 *
 * Laziness survives: a slot input the component never binds is never rendered,
 * so its subtree never instantiates.
 */

import { ChangeDetectionStrategy, Component, Input, forwardRef, signal } from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { NodeRendererComponent } from './node-renderer.component.js';

@Component({
  selector: 'cf-nodes',
  // `forwardRef` because nodes → node → node-host → nodes is a genuine module
  // cycle (a slot renders nodes, one of which may itself have slots). Every edge
  // that closes it is deferred, so the graph loads correctly no matter which of
  // the three modules a consumer imports first.
  imports: [forwardRef(() => NodeRendererComponent)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (node of nodeList(); track node.nodeId ?? $index) {
      <cf-node [node]="node" />
    }
  `,
})
export class NodesRendererComponent {
  protected readonly nodeList = signal<PortableRenderNode[]>([]);

  /**
   * Not `required`, so a component can forward an optional slot input straight
   * through — `[nodes]="children"` where `children` may be undefined — without
   * a non-null assertion at every call site.
   */
  @Input() set nodes(value: PortableRenderNode[] | null | undefined) {
    this.nodeList.set(value ?? []);
  }
}
