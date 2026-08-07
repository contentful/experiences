import type { ExperienceTemplateFixture } from './types.js';

// The `page` Experience Template declares a single "content" slot: an
// Experience using this Experience Template puts its top-level nodes into
// `slots.content`, and the Experience Template's componentTree tells the
// renderer where to drop them. No template-level content/design props for
// the minimal demo.
export const experienceTemplates: ExperienceTemplateFixture[] = [
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
