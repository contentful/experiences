/*
 * `@contentful/experiences-react/primitives` — the building blocks the SDK
 * renderers are made of, for hosts that walk the plan themselves.
 *
 * The main use is islands architectures (Astro): the host walks the plan,
 * renders each node with `resolveNodeProps` + `NodeView`, and hydrates
 * only the interactive ones, passing `resolved.snapshot` to an island built
 * with `createNodeView`. `NodeView` publishes the same context as
 * the SDK renderers, so the SDK hooks work inside every island.
 *
 * Additive to the main entry: `ServerExperienceRenderer` and
 * `ClientExperienceRenderer` render every node through the same
 * `resolveNodeProps` + `NodeView`. The raw providers stay exported for
 * hosts that need to compose context themselves.
 */

export { resolveNodeProps } from './resolve-node-props.js';
export type {
  ComponentNodeSnapshot,
  ExperienceTemplateNodeSnapshot,
  NodeSnapshot,
  ResolvedComponentNode,
  ResolvedExperienceTemplateNode,
  ResolvedNode,
  UnregisteredNode,
} from './resolve-node-props.js';

export { createNodeView, NodeView } from './node-view.js';
export type { BoundNodeViewProps, NodeViewProps } from './node-view.js';

export {
  ContentfulComponentProvider,
  ContentfulExperienceTemplateProvider,
  ExperienceProvider,
  ResolvedDesignProvider,
} from './context.js';
