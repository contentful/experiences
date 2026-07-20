import type { TemplateFixture } from './types.js';

// The `page` template is a passthrough — the renderer just wraps the experience
// tree with the customer's Page component (see examples/nextjs/components/Page.tsx).
// No template-level content/design properties for the minimal demo.
export const templates: TemplateFixture[] = [
  {
    id: 'page',
    name: 'Page',
    description: 'Passthrough page wrapper',
  },
];
