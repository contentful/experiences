/*
 * Registry lookup and prop merge for one plan node, shared by the SDK renderers
 * and custom renderers. Hook- and directive-free so any server module can call it.
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
  /** Merged props (defaults < design < content < resolveData), without slots. */
  props: Record<string, unknown>;
  /** Token-resolved design values. */
  design: Record<string, unknown>;
}

/**
 * A resolved node as plain data, without its component. Serializable as long
 * as the `resolveData` output it carries is.
 */
export interface ComponentNodeSnapshot extends NodeSnapshotBase {
  kind: 'component';
  contentful: ContentfulComponent;
}

export interface ExperienceTemplateNodeSnapshot extends NodeSnapshotBase {
  kind: 'experienceTemplate';
  contentful: ContentfulExperienceTemplate;
}

export type NodeSnapshot = ComponentNodeSnapshot | ExperienceTemplateNodeSnapshot;

interface ResolvedNodeExtras<S extends NodeSnapshot> {
  status: 'resolved';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry erases per-entry prop types; see `Components`.
  component: ComponentType<any>;
  /** This node as plain data, for passing across a serialization boundary. */
  snapshot: S;
}

export type ResolvedComponentNode = ComponentNodeSnapshot &
  ResolvedNodeExtras<ComponentNodeSnapshot>;

export type ResolvedExperienceTemplateNode = ExperienceTemplateNodeSnapshot &
  ResolvedNodeExtras<ExperienceTemplateNodeSnapshot>;

/** A node whose id has no registration. Returned, not thrown, so the caller picks the fallback. */
export interface UnregisteredNode {
  status: 'unregistered';
  kind: 'component' | 'experienceTemplate';
  id: string;
  nodeId?: string;
}

export type ResolvedNode =
  ResolvedComponentNode | ResolvedExperienceTemplateNode | UnregisteredNode;

/** Look a node up in `config.components` or `config.experienceTemplates` and merge its props. */
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
