/*
 * Node dispatch. Port of the first half of adapter-svelte/src/NodeRenderer.svelte.
 *
 * Angular's `providers` array is static per component class, so "provide
 * `ComponentScope` for component nodes and `ExperienceTemplateScope` for
 * template nodes" cannot be expressed as a conditional inside one class — it has
 * to be a choice between two classes. `<cf-node>` makes that choice; each
 * wrapper provides and connects its scopes, then hands off to the shared
 * `<cf-node-host>`.
 *
 * The three-class shape buys the ordering guarantee for free. In Svelte the
 * comment on `setContentfulComponent()` warns that the context write must stay
 * above the registry lookup; here the wrapper is constructed before the host
 * exists, so an unregistered node still exposes its payload to whatever renders
 * in its place. No statement order to preserve.
 *
 * Scopes are provided per node rather than per kind-of-subtree, and never
 * combined into one object: a component nested inside an experience template
 * shadows `ComponentScope` and `DesignScope` while leaving
 * `ExperienceTemplateScope` unshadowed, so the element-injector walk-up still
 * reaches the enclosing template's payload.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  forwardRef,
  inject,
  signal,
} from '@angular/core';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { NodeHostComponent } from './node-host.component.js';
import { ComponentScope, DesignScope, ExperienceTemplateScope } from './node-scopes.js';
import type { ContentfulComponent, ContentfulExperienceTemplate } from './types.js';

/**
 * Note `design` reads from `props.designRaw`, not `props.design`: the raw record
 * keeps every viewport's value, so a customer component doing its own cascade
 * math has the full picture. `injectDesignValues()` is the resolved view.
 */
function toContentfulComponent(node: PortableRenderNode | null): ContentfulComponent | undefined {
  if (!node) return undefined;
  return {
    componentId: node.registration.id,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
    slots: node.slots,
  };
}

function toContentfulExperienceTemplate(
  node: PortableRenderNode | null
): ContentfulExperienceTemplate | undefined {
  if (!node) return undefined;
  return {
    experienceTemplateId: node.registration.id,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
  };
}

@Component({
  selector: 'cf-component-node',
  imports: [forwardRef(() => NodeHostComponent)],
  providers: [DesignScope, ComponentScope],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (nodeValue(); as node) {
      <cf-node-host [node]="node" />
    }
  `,
})
export class ComponentNodeComponent {
  protected readonly nodeValue = signal<PortableRenderNode | null>(null);

  @Input({ required: true }) set node(value: PortableRenderNode) {
    this.nodeValue.set(value);
  }

  constructor() {
    // Connected from the constructor, before Angular binds `node` — hence the
    // `undefined` in `ComponentScope`'s signature. Nothing in the subtree exists
    // yet to observe the gap.
    inject(ComponentScope).connect(() => toContentfulComponent(this.nodeValue()));
  }
}

@Component({
  selector: 'cf-experience-template-node',
  imports: [forwardRef(() => NodeHostComponent)],
  providers: [DesignScope, ExperienceTemplateScope],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (nodeValue(); as node) {
      <cf-node-host [node]="node" />
    }
  `,
})
export class ExperienceTemplateNodeComponent {
  protected readonly nodeValue = signal<PortableRenderNode | null>(null);

  @Input({ required: true }) set node(value: PortableRenderNode) {
    this.nodeValue.set(value);
  }

  constructor() {
    inject(ExperienceTemplateScope).connect(() => toContentfulExperienceTemplate(this.nodeValue()));
  }
}

/**
 * Renders a single IR node. Exported for symmetry with `<cf-nodes>`, though
 * customers rendering slot children want `<cf-nodes>` — it handles the array and
 * the tracking key.
 */
@Component({
  selector: 'cf-node',
  imports: [ComponentNodeComponent, ExperienceTemplateNodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (nodeValue(); as node) {
      @if (node.registration.kind === 'experienceTemplate') {
        <cf-experience-template-node [node]="node" />
      } @else {
        <cf-component-node [node]="node" />
      }
    }
  `,
})
export class NodeRendererComponent {
  protected readonly nodeValue = signal<PortableRenderNode | null>(null);

  @Input({ required: true }) set node(value: PortableRenderNode) {
    this.nodeValue.set(value);
  }
}
