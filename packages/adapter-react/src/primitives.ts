/*
 * `@contentful/experiences-react/primitives` — the building blocks the SDK
 * renderers are made of, for hosts that walk the plan themselves.
 *
 * The main use is islands architectures (Astro): the host walks the plan,
 * renders each node with `resolveNodeProps` + `ExperienceNode`, and hydrates
 * only the interactive ones, passing `resolved.snapshot` to an island built
 * with `createExperienceNode`. `ExperienceNode` publishes the same context as
 * the SDK renderers, so the SDK hooks work inside every island.
 *
 * Additive to the main entry: `ServerExperienceRenderer` and
 * `ClientExperienceRenderer` render every node through the same
 * `resolveNodeProps` + `ExperienceNode`. The raw providers stay exported for
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

export { createExperienceNode, ExperienceNode } from './experience-node.js';
export type { BoundExperienceNodeProps, ExperienceNodeProps } from './experience-node.js';

export {
  ContentfulComponentProvider,
  ContentfulExperienceTemplateProvider,
  ExperienceProvider,
  ResolvedDesignProvider,
} from './context.js';
