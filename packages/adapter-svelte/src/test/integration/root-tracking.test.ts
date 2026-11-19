import {
  ContentfulExperiences,
  type OptimizationEventStreamEvent,
  type Subscription,
} from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearIdentityCookies } from '../../../../web/src/test/consent.js';
import { advance, installIOPolyfill } from '../../../../web/src/test/dom.js';
import { completeProfile } from '../../../../web/src/test/fixtures/profile.js';
import ExperienceRenderer from '../../rendering/ClientExperienceRenderer.svelte';
import ButtonFixture from '../fixtures/ButtonFixture.svelte';
import ExperienceTemplateFixture from '../fixtures/ExperienceTemplateFixture.svelte';
import { attributedPlan } from '../fixtures/render-plan.js';

const config = {
  components: { button: ButtonFixture },
  experienceTemplates: {
    page: { component: ExperienceTemplateFixture, root: { prop: 'experienceRoot' } },
  },
};
const templatePlan = () => {
  const plan = attributedPlan('page', {}, 'experienceTemplate');
  plan.nodes[0]!.slots.sidebar = [];
  return plan;
};
let sdk: ContentfulExperiences;
let subscription: Subscription;
let io: ReturnType<typeof installIOPolyfill>;
let attempts: OptimizationEventStreamEvent[];

beforeEach(() => {
  window.localStorage.clear();
  clearIdentityCookies();
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  io = installIOPolyfill();
  sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'test' },
    allowedEventTypes: [],
    defaults: { profile: completeProfile('visitor'), consent: true, persistenceConsent: false },
  });
  vi.spyOn(sdk.api.analytics, 'sendBatchEvents').mockResolvedValue(true);
  attempts = [];
  subscription = sdk.states.eventStream.subscribe((event) => {
    if (event) attempts.push(event);
  });
});

afterEach(async () => {
  subscription?.unsubscribe();
  cleanup();
  sdk?.destroy();
  await advance(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  clearIdentityCookies();
});

async function discover() {
  await tick();
  await advance(0);
}
const views = () => attempts.filter((event) => event.type === 'exo_node_view');
const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

it('groups sibling roots and keeps repeated presentations active across root changes and independent unmount', async () => {
  const first = render(ExperienceRenderer, { experience: templatePlan(), config });
  const second = render(ExperienceRenderer, { experience: templatePlan(), config });
  await discover();
  const main = first.container.querySelector('main')!;
  const aside = first.container.querySelector('aside')!;
  const repeated = second.container.querySelector('main')!;
  expect(main.parentElement).not.toBe(repeated.parentElement);
  for (const root of [main, aside, repeated]) io.trigger(root, true);
  await advance(1200);
  expect(views()).toHaveLength(2);
  const [a, b] = views();
  expect(a).toMatchObject({ entityId: 'hero', viewDurationMs: 1000 });
  expect(b).toMatchObject({ entityId: 'hero', viewDurationMs: 1000 });
  expect(a!.viewId).not.toBe(b!.viewId);

  const singleRoot = templatePlan();
  delete singleRoot.nodes[0]!.slots.sidebar;
  await first.rerender({ experience: singleRoot, config });
  await discover();
  expect(main.isConnected).toBe(true);
  expect(aside.isConnected).toBe(false);
  await advance(300);
  io.trigger(main, false);
  await discover();
  expect(
    views()
      .filter((event) => event.viewId === a!.viewId)
      .map((event) => event.viewDurationMs)
  ).toEqual([1000, 1500]);

  await first.rerender({ experience: attributedPlan('button'), config });
  await discover();
  expect(main.isConnected).toBe(false);
  const replacement = first.container.querySelector('button')!;
  io.trigger(replacement, true);
  await advance(1200);
  expect(views()).toHaveLength(4);
  expect(views().at(-1)).toMatchObject({ entityId: 'hero', viewDurationMs: 1000 });
  expect(views().at(-1)!.viewId).not.toBe(a!.viewId);
  first.unmount();
  await discover();
  expect(replacement.isConnected).toBe(false);
  expect(repeated.isConnected).toBe(true);
  io.trigger(repeated, false);
  await discover();
  expect(
    views()
      .filter((event) => event.viewId === b!.viewId)
      .at(-1)?.viewDurationMs
  ).toBe(2700);
});

it('measures forwarded-root hovers and clicks through Web consent and element controls', async () => {
  const view = render(ExperienceRenderer, { experience: attributedPlan('button'), config });
  await discover();
  const button = view.container.querySelector('button')!;
  const hover = (entering: boolean) =>
    button.dispatchEvent(
      new PointerEvent(entering ? 'pointerenter' : 'pointerleave', { pointerType: 'mouse' })
    );
  hover(true);
  click(button);
  await advance(1200);
  hover(false);
  await discover();
  expect(
    attempts
      .filter((event) => event.type === 'exo_node_hover')
      .map((event) => event.hoverDurationMs)
  ).toEqual([1000, 1200]);
  expect(attempts.filter((event) => event.type === 'exo_node_click')).toHaveLength(1);
  sdk.tracking.disableElement('clicks', button);
  const count = attempts.length;
  click(button);
  await discover();
  expect(attempts).toHaveLength(count);
  sdk.tracking.clearElement('clicks', button);
  hover(true);
  sdk.consent({ events: false });
  click(button);
  await advance(1200);
  hover(false);
  await discover();
  expect(attempts).toHaveLength(count);
});
