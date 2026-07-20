import type { TemplateFixture } from './types.js';

// The `page` template declares a single "content" slot: an Experience using
// this template puts its top-level nodes into `slots.content`, and the
// template's componentTree tells the renderer where to drop them. No
// template-level content/design props for the minimal demo.
export const templates: TemplateFixture[] = [
  {
    id: 'page',
    name: 'Page',
    description: 'Passthrough page wrapper — renders the Experience content slot',
    slots: [{ id: 'content', name: 'Content' }],
    componentTree: [
      {
        id: 'page-content-slot',
        nodeType: 'Slot',
        slotId: 'content',
      },
    ],
  },
];
