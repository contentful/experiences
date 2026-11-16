import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'node',
    globals: true,
    environment: 'node',
    provide: { webTestEnvironment: 'node' },
    include: [
      'src/runtime/snapshot-runtime.test.ts',
      'src/preview/preview-session.test.ts',
      'src/sdk/contentful-experiences.test.ts',
      'src/browser/event-context.test.ts',
      'src/preview/preview-session-binding.test.ts',
    ],
  },
});
