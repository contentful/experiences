/** @vitest-environment jsdom */
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-web';
import type { RuntimeLivePreviewModule } from '@contentful/experiences-runtime';
import { ExperiencesContext } from '../../runtime/experiences-context.js';
import {
  useManagedExperience,
  type ManagedExperienceOptions,
  type ManagedExperienceResult,
} from '../../experience/use-managed-experience.js';
import { createReactTestRoot, type ReactTestRoot } from '../react-root.js';
import { deferred } from '../managed-experience.js';
import { plan } from '../fixtures/managed-experience.js';

const config = { components: {} };
let root: ReactTestRoot;
let result: ManagedExperienceResult;
function Probe({ options }: { options: ManagedExperienceOptions }) {
  result = useManagedExperience(options);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createReactTestRoot();
});
afterEach(() => {
  act(() => root.cleanup());
  vi.unstubAllGlobals();
});

it('automatically fetches a replacement matching session when preview is static', async () => {
  const snapshot = deferred<PortableRenderPlan>();
  const implementation: RuntimeLivePreviewModule = {
    fetchPreviewSession: vi.fn(() => snapshot.promise),
    createLivePreviewClient() {
      throw new Error('socket unavailable');
    },
    sendPreviewStatus() {},
  };
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'delivery' },
    preview: { accessToken: 'preview' },
    livePreview: {
      experienceId: 'home',
      sessionId: 'session-a',
      loadImplementation: () => implementation,
    },
  });
  try {
    await act(async () =>
      root.render(
        <ExperiencesContext.Provider
          value={{ sdk, error: undefined, isLive: true, isContentReady: true }}
        >
          <Probe options={{ experienceId: 'home', config, initialPlan: plan('retained') }} />
        </ExperiencesContext.Provider>
      )
    );
    expect(implementation.fetchPreviewSession).not.toHaveBeenCalled();
    await act(async () =>
      sdk.replaceLivePreview({
        experienceId: 'home',
        sessionId: 'session-b',
        loadImplementation: () => implementation,
      })
    );
    expect(sdk.states.preview.current?.status).toBe('static');
    expect(result.data?.nodes[0]?.props.content.title).toBe('retained');
    expect(implementation.fetchPreviewSession).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sessionId: 'session-b' }),
      expect.anything(),
      expect.anything()
    );
    await act(async () => snapshot.resolve(plan('replacement')));
    expect(result.data?.nodes[0]?.props.content.title).toBe('replacement');
  } finally {
    act(() => root.cleanup());
    sdk.destroy();
  }
});
