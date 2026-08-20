/*
 * The two rendering primitives customers reach for: `*cfNodes` for a whole slot,
 * `*cfNode` for one child at a time.
 *
 * Structural directives, not components, so nothing the adapter owns lands in
 * the DOM — see the note at the top of node-render-engine.ts for why that
 * matters. Neither directive ever uses its `TemplateRef`: the microsyntax is
 * borrowed purely because `*foo` is how Angular expresses "this element is an
 * anchor, not an element". Written out, `<ng-container *cfNodes="nodes()">`
 * desugars to an `<ng-template>` whose only DOM trace is a comment.
 *
 * Both create synchronously from the input setter, the same point
 * `NgComponentOutlet` creates from in `ngOnChanges` — a single `detectChanges()`
 * has to produce the whole tree, which rules out deferring to an `effect`.
 * `ngDoCheck` then covers the one input the engine reads but is not bound to:
 * the registry on `ExperienceScope`.
 */

import {
  Directive,
  type DoCheck,
  Injector,
  Input,
  type OnDestroy,
  ViewContainerRef,
  inject,
} from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { ExperienceScope } from './experience-scope.js';
import { NodeRenderEngine } from './node-render-engine.js';

/**
 * Renders a slot's nodes as direct children of the surrounding element.
 *
 * ```html
 * <div class="grid"><ng-container *cfNodes="children()"></ng-container></div>
 * ```
 *
 * Load-bearing in this adapter rather than an escape hatch: Angular has no lazy
 * renderable-child primitive for arbitrary named slots, so each slot arrives as
 * a same-named `PortableRenderNode[]` input and this is how it gets rendered.
 */
@Directive({ selector: '[cfNodes]' })
export class NodesRendererDirective implements DoCheck, OnDestroy {
  // `inject(Injector)` is the anchor's own injector — the same value
  // `NgComponentOutlet` defaults to — so the element-injector walk-up from a
  // created component reaches the enclosing node's scopes.
  private readonly engine = new NodeRenderEngine(
    inject(ViewContainerRef),
    inject(Injector),
    inject(ExperienceScope)
  );

  /**
   * Not `required`, so a component can forward an optional slot input straight
   * through — `*cfNodes="children()"` where `children` may be undefined —
   * without a non-null assertion at every call site.
   */
  @Input() set cfNodes(value: PortableRenderNode[] | null | undefined) {
    this.engine.setNodes(value ?? []);
  }

  ngDoCheck(): void {
    this.engine.checkConfig();
  }

  ngOnDestroy(): void {
    this.engine.destroy();
  }
}

/**
 * Renders a single node. Use it to wrap, reorder or drop slot children
 * individually:
 *
 * ```html
 * @for (child of children() ?? []; track $index) {
 *   <div class="cell"><ng-container *cfNode="child"></ng-container></div>
 * }
 * ```
 */
@Directive({ selector: '[cfNode]' })
export class NodeRendererDirective implements DoCheck, OnDestroy {
  private readonly engine = new NodeRenderEngine(
    inject(ViewContainerRef),
    inject(Injector),
    inject(ExperienceScope)
  );

  @Input({ required: true }) set cfNode(value: PortableRenderNode) {
    this.engine.setNodes([value]);
  }

  ngDoCheck(): void {
    this.engine.checkConfig();
  }

  ngOnDestroy(): void {
    this.engine.destroy();
  }
}
