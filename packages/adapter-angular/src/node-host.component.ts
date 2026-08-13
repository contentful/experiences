/*
 * Shared per-node render logic: registry lookup, slot inputs, design
 * resolution, prop merge, and the three-way outlet branch. Port of the second
 * half of adapter-svelte/src/NodeRenderer.svelte.
 *
 * It is split from the two scoped wrappers in node-renderer.component.ts
 * because Angular's `providers` array is static per component class, so the
 * choice of which per-node scopes to provide has to be made by *which class*
 * gets instantiated. The wrappers make that choice and provide + connect the
 * scopes; everything downstream of the choice lives here, once.
 *
 * That split is also what makes the Svelte adapter's ordering guarantee
 * structural rather than a matter of statement order: the wrapper — and
 * therefore the node's context — is fully constructed before this component
 * exists to perform the registry lookup, so an unregistered node still exposes
 * its payload to whatever renders in its place.
 */

import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type Type,
  computed,
  forwardRef,
  inject,
  reflectComponentType,
  signal,
} from '@angular/core';

import { selectResolvedDesign } from '@contentful/experiences-design';
import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { ExperienceScope } from './experience-scope.js';
import { DesignScope } from './node-scopes.js';
import { NodesRendererComponent } from './nodes-renderer.component.js';
import {
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
} from './types.js';

/**
 * What this node resolves to. `render` covers both the registered-component
 * case and the missing-component fallback — they differ only in which class and
 * which inputs, so there is no reason for the template to branch twice.
 */
type Resolution =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'render';
      readonly component: Type<unknown>;
      readonly inputs: Record<string, unknown>;
    }
  | { readonly mode: 'orphaned'; readonly nodes: PortableRenderNode[] };

/**
 * One `PortableRenderNode[]` input per slot, keyed by slot name. Angular has no
 * lazy renderable-child primitive that supports arbitrary named slots, so slots
 * arrive as raw node arrays and customers render them with `<cf-nodes>`. That
 * keeps slot children lazy: an unrendered slot never instantiates.
 *
 * The array check is the adapter's only remaining throw. Payloads are validated
 * upstream, so reaching it means a hand-built or corrupted plan.
 */
function toSlotInputs(node: PortableRenderNode | null): Record<string, PortableRenderNode[]> {
  if (!node) return {};
  const slots: Record<string, PortableRenderNode[]> = {};
  for (const [slotName, children] of Object.entries(node.slots)) {
    if (!Array.isArray(children)) {
      const { kind, id } = node.registration;
      throw new TypeError(
        `[@contentful/experiences-angular] Slot "${slotName}" on ${kind} "${id}" is not an array of nodes.`
      );
    }
    slots[slotName] = children;
  }
  return slots;
}

/**
 * Narrow the merged record to the keys the target component actually declares
 * as inputs. Angular-only, and not optional: `setInput` on an undeclared input
 * logs a dev-mode warning, so passing the full record would emit one warning
 * per design key the component never asked for.
 *
 * The visible consequence — dropped keys are not passed as inputs — is the
 * documented Angular divergence in the README's parity table. They stay
 * reachable through `injectDesignValues()` and `injectContentfulComponent()`.
 * A pleasant side effect: the adapter cannot leak framework props onto a
 * customer component, because it never declared them.
 */
function filterToDeclaredInputs(
  component: Type<unknown>,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const mirror = reflectComponentType(component);
  if (!mirror) return {};
  const declared = new Set(mirror.inputs.map(({ templateName }) => templateName));
  const inputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (declared.has(key)) inputs[key] = value;
  }
  return inputs;
}

@Component({
  selector: 'cf-node-host',
  imports: [NgComponentOutlet, forwardRef(() => NodesRendererComponent)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Two sibling `@if`s rather than `@else if`: the modes are mutually exclusive
  // by construction, and separate blocks each narrow the union cleanly under
  // `strictTemplates`.
  template: `
    @if (resolution(); as resolved) {
      @if (resolved.mode === 'render') {
        <ng-container *ngComponentOutlet="resolved.component; inputs: resolved.inputs" />
      }
      @if (resolved.mode === 'orphaned') {
        <cf-nodes [nodes]="resolved.nodes" />
      }
    }
  `,
})
export class NodeHostComponent {
  protected readonly nodeValue = signal<PortableRenderNode | null>(null);

  @Input({ required: true }) set node(value: PortableRenderNode) {
    this.nodeValue.set(value);
  }

  private readonly experienceScope = inject(ExperienceScope);

  private readonly slotInputs = computed(() => toSlotInputs(this.nodeValue()));

  /**
   * Viewport-cascaded, token-resolved design values. Kept in its own computed
   * so `injectDesignValues()` readers are not invalidated by a content change.
   */
  protected readonly tokenResolvedDesign = computed<Record<string, unknown>>(() => {
    const node = this.nodeValue();
    if (!node) return {};
    const experience = this.experienceScope.experience();
    const { props, unresolved } = selectResolvedDesign(
      node.props,
      experience.viewports,
      experience.activeViewportIndex,
      experience.fallbackViewportIndex,
      this.experienceScope.config().resolveToken
    );
    if (unresolved.length && typeof console !== 'undefined') {
      const { kind, id } = node.registration;
      console.warn(
        `[@contentful/experiences-angular] resolveToken returned undefined for token id(s) on ${kind} "${id}": ${unresolved.join(', ')}. injectDesignValues() will omit those keys.`
      );
    }
    return props;
  });

  protected readonly resolution = computed<Resolution>(() => {
    const node = this.nodeValue();
    if (!node) return { mode: 'none' };

    // Read ahead of the registry lookup: the unregistered-template path renders
    // slot children unwrapped, so a malformed slot has to fail identically for
    // registered and unregistered nodes.
    const slots = this.slotInputs();

    const { kind, id } = node.registration;
    const isExperienceTemplate = kind === 'experienceTemplate';
    const config = this.experienceScope.config();
    const entry = isExperienceTemplate ? config.experienceTemplates?.[id] : config.components[id];

    if (entry) {
      const normalized = isExperienceTemplate
        ? normalizeExperienceTemplateRegistration(entry)
        : normalizeComponentRegistration(entry);
      // Merge precedence (last wins): defaults < design < content < resolveData < slots.
      const merged = {
        ...normalized.defaults,
        ...this.tokenResolvedDesign(),
        ...node.props.content,
        ...node.props.resolved,
        ...slots,
      };
      return {
        mode: 'render',
        component: normalized.component,
        inputs: filterToDeclaredInputs(normalized.component, merged),
      };
    }

    // An unregistered Experience Template would blank the page if we swapped it
    // for the missing-component box, so warn and render its slot children
    // unwrapped — the content survives, the diagnostic names what's missing.
    if (isExperienceTemplate) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[@contentful/experiences-angular] No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`
        );
      }
      return { mode: 'orphaned', nodes: Object.values(slots).flat() };
    }

    const renderUnknown = this.experienceScope.renderUnknown();
    return {
      mode: 'render',
      component: renderUnknown,
      inputs: filterToDeclaredInputs(renderUnknown, {
        componentId: id,
        nodeId: node.nodeId,
      }),
    };
  });

  constructor() {
    // The nearest `DesignScope` is the one its wrapper provided for this node.
    inject(DesignScope).connect(() => this.tokenResolvedDesign());
  }
}
