import { ContentfulExperiences } from '@contentful/experiences-web';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import ManagedOwnedHarness from '../fixtures/ManagedOwnedHarness.svelte';

vi.mock('@contentful/experiences-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-web')>()),
  ContentfulExperiences: vi.fn(() => {
    throw new Error('Web constructed during SSR');
  }),
}));
const config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'test' },
};

describe('managed server presentation', () => {
  it('renders seeded state through the server snippet calling convention without a browser owner', () => {
    const resolved = vi.fn();
    const result = render(ManagedOwnedHarness, {
      props: {
        config,
        custom: true,
        options: {
          experienceId: 'primary',
          onExperienceResolved: resolved,
          initialPlan: {
            experienceId: 'primary',
            nodes: [],
            metadata: { title: 'Supplied SSR' },
            debug: false,
            diagnostics: [],
          },
        },
      },
    });
    expect(result.body).toContain('success|Supplied SSR');
    expect(result.body).not.toContain('Baseline error');
    expect(ContentfulExperiences).not.toHaveBeenCalled();
    expect(resolved).not.toHaveBeenCalled();
  });

  it('renders app loading/error snippets without exposing raw errors or acquiring content', () => {
    const loading = render(ManagedOwnedHarness, {
      props: {
        config,
        options: { experienceId: 'primary' },
      },
    });
    expect(loading.body).toContain('Baseline loading idle');
    const failure = render(ManagedOwnedHarness, {
      props: {
        config,
        options: { experienceId: 'primary', initialError: new Error('private failure detail') },
      },
    });
    expect(failure.body).toContain('Baseline error error');
    expect(failure.body).not.toContain('private failure detail');
    expect(ContentfulExperiences).not.toHaveBeenCalled();
  });
});
