/*
 * The per-node prop merge `NodeRenderer` runs, exported so a host that walks
 * the plan itself (an Astro page emitting one island per interactive node, for
 * example) renders each node with exactly the props the SDK renderer would.
 *
 * Hook-free and directive-free on purpose: it has to be callable from a React
 * Server Component, from Astro frontmatter, or from any plain server module.
 */

import type { ComponentType } from 'react';

import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import {
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
  type Config,
  type ContentfulComponent,
  type ContentfulExperienceTemplate,
} from './types.js';

interface NodeSnapshotBase {
  id: string;
  nodeId?: string;
  /**
   * Merged props, last wins: defaults < design < content < resolveData. Slot
   * props are not included; the host renders each slot and spreads it on top.
   */
  props: Record<string, unknown>;
  /** Token-resolved design values. The value for `ResolvedDesignProvider`. */
  design: Record<string, unknown>;
}

/**
 * A resolved component node as plain data: everything `ExperienceNode` needs
 * except the component itself, which the receiving side looks up by `id`.
 * Safe to pass anywhere props get serialized (an Astro island, a `'use client'`
 * boundary), provided the `resolveData` output it carries is plain data too.
 */
export interface ComponentNodeSnapshot extends NodeSnapshotBase {
  kind: 'component';
  /** The value for `ContentfulComponentProvider`. */
  contentful: ContentfulComponent;
}

/** `ComponentNodeSnapshot` for a node registered in `config.experienceTemplates`. */
export interface ExperienceTemplateNodeSnapshot extends NodeSnapshotBase {
  kind: 'experienceTemplate';
  /** The value for `ContentfulExperienceTemplateProvider`. */
  contentful: ContentfulExperienceTemplate;
}

export type NodeSnapshot = ComponentNodeSnapshot | ExperienceTemplateNodeSnapshot;

interface ResolvedNodeExtras<S extends NodeSnapshot> {
  status: 'resolved';
  /** The registered implementation, from the bare or `{ component }` registration. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry erases per-entry prop types; see `Components`.
  component: ComponentType<any>;
  /** This node without `component` and `status`, for crossing a serialization boundary. */
  snapshot: S;
}

/** A node whose id is registered in `config.components`. */
export type ResolvedComponentNode = ComponentNodeSnapshot &
  ResolvedNodeExtras<ComponentNodeSnapshot>;

/** A node whose id is registered in `config.experienceTemplates`. */
export type ResolvedExperienceTemplateNode = ExperienceTemplateNodeSnapshot &
  ResolvedNodeExtras<ExperienceTemplateNodeSnapshot>;

/**
 * A node whose id has no registration. Returned rather than thrown so the
 * host chooses the fallback: the SDK renderer shows the missing-component box
 * for a component and renders an Experience Template's slot children unwrapped.
 */
export interface UnregisteredNode {
  status: 'unregistered';
  kind: 'component' | 'experienceTemplate';
  id: string;
  nodeId?: string;
}

export type ResolvedNode =
  ResolvedComponentNode | ResolvedExperienceTemplateNode | UnregisteredNode;

/**
 * Look a plan node up in `config` and merge its props the way the SDK
 * renderer does. Covers both `config.components` and
 * `config.experienceTemplates`, selected by `node.registration.kind`.
 */
export function resolveNodeProps(node: PortableRenderNode, config: Config): ResolvedNode {
  const { kind, id } = node.registration;
  const { nodeId } = node;

  if (kind === 'experienceTemplate') {
    const entry = config.experienceTemplates?.[id];
    if (!entry) return { status: 'unregistered', kind, id, nodeId };
    const registration = normalizeExperienceTemplateRegistration(entry);
    const snapshot: ExperienceTemplateNodeSnapshot = {
      kind,
      id,
      nodeId,
      props: mergeProps(registration.defaults, node),
      design: node.props.design,
      contentful: {
        experienceTemplateId: id,
        nodeId,
        content: node.props.content,
        design: node.props.designRaw,
        resolved: node.props.resolved,
        attribution: node.attribution,
      },
    };
    return { ...snapshot, status: 'resolved', component: registration.component, snapshot };
  }

  const entry = config.components[id];
  if (!entry) return { status: 'unregistered', kind, id, nodeId };
  const registration = normalizeComponentRegistration(entry);
  const snapshot: ComponentNodeSnapshot = {
    kind,
    id,
    nodeId,
    props: mergeProps(registration.defaults, node),
    design: node.props.design,
    contentful: {
      componentId: id,
      nodeId,
      content: node.props.content,
      design: node.props.designRaw,
      resolved: node.props.resolved,
      attribution: node.attribution,
    },
  };
  return { ...snapshot, status: 'resolved', component: registration.component, snapshot };
}

// Merge precedence (last wins): defaults < design < content < resolveData.
function mergeProps(
  defaults: object | undefined,
  node: PortableRenderNode
): Record<string, unknown> {
  return {
    ...defaults,
    ...node.props.design,
    ...node.props.content,
    ...node.props.resolved,
  };
}
