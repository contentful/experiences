import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';

vi.mock('@contentful/experiences-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-web')>()),
  ContentfulExperiences: vi.fn(() => {
    throw new Error('browser constructor called during SSR');
  }),
}));
const config: Config = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'test' },
  locale: 'de-DE',
  defaults: {
    consent: true,
    persistenceConsent: false,
    changes: [
      {
        type: 'Variable',
        key: 'test',
        value: 'server flag',
        meta: { experienceId: 'experiment', variantIndex: 1 },
      },
    ],
  },
};

describe('OwnedActivationBoundary server presentation', () => {
  it('renders supplied content with configured readonly state without constructing Web', () => {
    const output = render(RuntimeHarness, { props: { config } });
    expect(output.body).toContain('idle|de-DE|neutral|true|server flag|');
    expect(output.body).toContain('supplied content');
    expect(ContentfulExperiences).not.toHaveBeenCalled();
  });

  it('lets an explicit snapshot take precedence over browser defaults', () => {
    const output = render(RuntimeHarness, {
      props: { config, snapshot: { locale: 'fr-FR', consent: false } },
    });
    expect(output.body).toContain('idle|fr-FR|neutral|false|undefined|');
    expect(ContentfulExperiences).not.toHaveBeenCalled();
  });
});
