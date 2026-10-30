import type { DestinationFixture } from './types.js';

// A Channel (org-level routing model) with one Destination under it. Nodes map
// paths to the `home` and `landing` Experiences so the example apps can resolve by path
// (`/`, `/demo/landing`), follow a redirect (`/welcome`), and enumerate the
// routes with `fetchDestinationSitemap`.
//
// Node `path` values are a single segment with no slashes (letters, numbers,
// hyphens, underscores, dots); the API joins parent segments on resolution. The
// home node uses an empty path and resolves to `/`. The reference page shows
// leading slashes, but the API rejects them. The channel declares a single
// `Path` node property; `baseUrl` is optional site config.
export const destination: DestinationFixture = {
  channel: {
    id: 'demo-web',
    name: 'Demo Web',
    description: 'Routing model for the example apps',
    properties: [{ name: 'Base URL', id: 'baseUrl', type: 'String' }],
    nodeProperties: [{ name: 'Path', type: 'Path' }],
  },
  destination: {
    name: 'Demo Website',
    description: 'Destination used by the example apps',
    properties: [{ id: 'baseUrl', value: 'http://localhost:3000' }],
  },
  nodes: [
    // Home node: the one node allowed to claim `/`.
    { id: 'demo-node-home', kind: 'experience', path: '', experienceId: 'home' },
    // Folder with a child, to exercise multi-segment paths (`/demo/landing`).
    { id: 'demo-node-demo', kind: 'folder', path: 'demo' },
    {
      id: 'demo-node-demo-landing',
      kind: 'experience',
      path: 'landing',
      experienceId: 'landing',
      parentNodeId: 'demo-node-demo',
    },
    // Redirect: `/welcome` resolves to `{ redirect: { path: '/' } }`.
    {
      id: 'demo-node-welcome',
      kind: 'redirect',
      path: 'welcome',
      redirectToNodeId: 'demo-node-home',
    },
  ],
};
