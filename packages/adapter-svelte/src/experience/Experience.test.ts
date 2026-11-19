import { cleanup, render, waitFor } from '@testing-library/svelte';
import { resolveExperience, type PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ContentfulExperiences } from '@contentful/experiences-web';
import { afterEach, expect, it, vi } from 'vitest';
import Harness from '../test/fixtures/ManagedExperienceHarness.svelte';
import { componentNode } from '../test/fixtures/render-plan.js';
import type { ManagedExperience } from './source-types.js';

let sdk: ContentfulExperiences | undefined;
afterEach(() => {
  cleanup();
  sdk?.destroy();
  sdk = undefined;
  window.localStorage.clear();
  vi.restoreAllMocks();
});
function runtime() {
  sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'test' },
  });
  return sdk;
}
async function plan(text: string): Promise<PortableRenderPlan> {
  return {
    ...(await resolveExperience(
      { nodes: [componentNode('heading', { contentProperties: { text } })] },
      { components: {} }
    )),
    experienceId: 'a',
  };
}

it('shares a seeded primary across views and observes it without startup content fetching', async () => {
  const instance = runtime();
  const fetch = vi.spyOn(instance, 'fetchExperience');
  const resolved = vi.fn();
  let current!: ManagedExperience;
  const initialPlan = await plan('Seeded content');
  const view = render(Harness, {
    sdk: instance,
    options: { experienceId: 'a', initialPlan, onExperienceResolved: resolved },
    secondary: { experienceId: 'a', initialPlan, onExperienceResolved: resolved },
    capture: (value) => (current = value),
  });
  await waitFor(() => expect(view.getAllByRole('heading')).toHaveLength(2));
  expect(current.data).toBe(initialPlan);
  expect(current.result?.plan).toBe(initialPlan);
  expect(fetch).not.toHaveBeenCalled();
  expect(resolved).toHaveBeenCalledTimes(2);
  const replacement = vi.fn();
  await view.rerender({
    options: { experienceId: 'a', initialPlan, onExperienceResolved: replacement },
  });
  expect(replacement).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValue(initialPlan);
  await view.rerender({
    routeKey: '/translated',
    options: { experienceId: 'a', locale: 'de-DE' },
    secondary: { experienceId: 'a', locale: 'de-DE' },
  });
  await waitFor(() => expect(current.result?.request.locale).toBe('de-DE'));
  expect(current.result?.routeKey).toBe('/translated');
  expect(view.getAllByRole('heading')).toHaveLength(2);
  expect(fetch).toHaveBeenCalledOnce();
  await view.rerender({
    options: { experienceId: 'a' },
    secondary: { experienceId: 'a' },
  });
  await waitFor(() => {
    expect(current.status).toBe('success');
    expect(current.result?.request.locale).toBe(instance.locale);
  });
  instance.setLocale('fr-FR');
  await waitFor(() => expect(current.result?.request.locale).toBe('fr-FR'));
  expect(fetch.mock.calls.at(-1)?.[0].locale).toBe('fr-FR');
  expect(view.getAllByRole('heading')).toHaveLength(2);
});

it('uses application snippets and prefers usable content over error UI', async () => {
  const instance = runtime();
  let finish!: (plan: PortableRenderPlan) => void;
  vi.spyOn(instance, 'fetchExperience').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(Harness, { sdk: instance, options: { experienceId: 'a' } });
  expect(view.getByText('Application loading')).toBeTruthy();
  finish(await plan('Loaded content'));
  await waitFor(() => expect(view.getByRole('heading').textContent).toBe('Loaded content'));
  await view.rerender({ custom: true });
  expect(view.getByText('Custom success')).toBeTruthy();
  expect(view.queryByRole('heading')).toBeNull();
  cleanup();
  const error = new Error('private transport detail');
  const failed = render(Harness, {
    sdk: instance,
    options: { experienceId: 'a', initialError: error },
  });
  expect(failed.getByText('Application error')).toBeTruthy();
  expect(failed.queryByText(error.message)).toBeNull();
  cleanup();
  const seeded = render(Harness, {
    sdk: instance,
    options: { experienceId: 'a', initialPlan: await plan('Retained seed'), initialError: error },
  });
  expect(seeded.getByRole('heading').textContent).toBe('Retained seed');
  expect(seeded.queryByText('Application error')).toBeNull();
});

it('stops notifications when a presentation callback tears down the view', async () => {
  const instance = runtime();
  const initialPlan = await plan('Ready');
  const view = render(Harness, { sdk: instance, options: { experienceId: 'a', initialPlan } });
  const onError = vi.fn();
  const onResolved = vi.fn(() => view.unmount());
  await view.rerender({
    options: {
      experienceId: 'b',
      initialPlan: { ...initialPlan, experienceId: 'b' },
      initialError: new Error('failed update'),
      onExperienceResolved: onResolved,
      onExperienceError: onError,
    },
  });
  expect(onResolved).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

it('rejects a mixed raw selector before seeded content, Preview or page work', async () => {
  const instance = runtime();
  const fetch = vi.spyOn(instance, 'fetchExperience');
  const preview = vi.spyOn(instance, 'subscribeToPreview');
  const buildPagePayload = vi.fn();
  const initialPlan = await plan('Seed must not bypass validation');
  expect(() =>
    render(Harness, {
      sdk: instance,
      options: {
        experienceId: 'a',
        destinationId: 'destination',
        path: '/',
        initialPlan,
      },
      buildPagePayload,
    })
  ).toThrow(TypeError);
  expect(fetch).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(buildPagePayload).not.toHaveBeenCalled();
});
