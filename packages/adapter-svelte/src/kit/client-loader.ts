import { assertExperienceSelector } from '@contentful/experiences-client';
import {
  resolvePreviewSessionId,
  type FetchExperienceOptions,
  type FetchResolveOptions,
} from '@contentful/experiences-runtime';
import type { RuntimeOwner } from '../runtime/owner-controller.svelte.js';
import type { ContentfulExperiences } from '@contentful/experiences-web';
import { assertRouteKey, type PreparationInput } from './request-protocol.js';
import {
  createRequestSource,
  requestSelection,
  type ManagedRequestSource,
  type RequestCandidate,
} from './request-source.js';
import type { RequestResult } from './request-result.js';

export interface ExperienceLoadEvent {
  readonly url: URL;
  readonly fetch: typeof globalThis.fetch;
  depends?(...dependencies: string[]): void;
}

export interface ExperienceLoadOptions {
  readonly experience: FetchExperienceOptions;
  readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
}

export function createClientLoader(options: {
  endpoint: string;
  getOwner(): RuntimeOwner | undefined;
  getCommittedSource(): ManagedRequestSource | undefined;
  getCommittedSelection(): string | undefined;
  /** Explicit init belongs to the server-backed CSR recipe, not hydrated documents. */
  initializedBeforeLoad(): boolean;
}) {
  assertRouteKey(options.endpoint);
  if (options.endpoint.includes('?'))
    throw new TypeError('The preparation endpoint must be a pathname.');
  const operations = new WeakMap<
    ExperienceLoadEvent,
    { key: string; source: Promise<ReturnType<typeof createRequestSource>> }
  >();
  return function loadExperience(event: ExperienceLoadEvent, input: ExperienceLoadOptions) {
    assertExperienceSelector(input.experience);
    const routeKey = event.url.pathname + event.url.search;
    const identity = JSON.stringify(input);
    const existing = operations.get(event);
    if (existing) {
      if (existing.key !== identity)
        throw new TypeError('Only one primary Experience operation is supported per load.');
      return existing.source;
    }
    event.depends?.('exo:primary');
    let initial = true;
    async function acquire(operation: PreparationInput['operation']): Promise<RequestCandidate> {
      const browserInputs =
        typeof window !== 'undefined' &&
        (!initial || options.initializedBeforeLoad() || options.getCommittedSource() !== undefined);
      initial = false;
      const owner =
        typeof window === 'undefined' || !browserInputs ? undefined : options.getOwner();
      if (owner?.current.status === 'error' || owner?.current.status === 'disposed') {
        return {
          routeKey,
          experience: input.experience,
          error: owner.current.error ?? new Error('Experiences runtime is unavailable.'),
        };
      }
      const preparation =
        owner?.current.status === 'ready' && browserInputs
          ? (owner.current.sdk as ContentfulExperiences).capturePreparation()
          : undefined;
      const sdk = preparation ? (owner?.current.sdk as ContentfulExperiences) : undefined;
      const sessionId = sdk?.config.preview
        ? resolvePreviewSessionId(event.url.searchParams)
        : undefined;
      const lifetime = sdk?.captureLifetime();
      const locale = input.experience.locale ?? preparation?.inputs.locale;
      const context = { locale, sessionId, resolveOptions: input.resolveOptions };
      const body: PreparationInput = {
        operation,
        routeKey,
        experience: input.experience,
        ...(input.resolveOptions ? { resolveOptions: input.resolveOptions } : {}),
        ...(browserInputs && preparation ? preparation.inputs : {}),
      };
      try {
        const response = await event.fetch(options.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Experience preparation is unavailable.');
        const result = (await response.json()) as RequestResult;
        if (typeof result.requestId !== 'string' || result.routeKey !== routeKey)
          throw new Error('Invalid Experience preparation result.');
        if (lifetime && !lifetime()) throw new Error('Experience preparation was superseded.');
        return {
          routeKey,
          experience: input.experience,
          result,
          preparation,
          ...context,
        };
      } catch (error) {
        return {
          routeKey,
          experience: input.experience,
          error: error instanceof Error ? error : new Error(String(error)),
          preparation,
          ...context,
        };
      }
    }
    const locale =
      typeof window !== 'undefined' && options.getCommittedSource()
        ? options.getOwner()?.current.sdk.locale
        : undefined;
    const selection = requestSelection({
      routeKey,
      experience: input.experience,
      locale,
      resolveOptions: input.resolveOptions,
    });
    const operation =
      typeof window !== 'undefined' && options.getCommittedSelection() === selection
        ? 'read'
        : 'prepare';
    const source = acquire(operation).then((candidate) =>
      createRequestSource(candidate, () => acquire('read'))
    );
    operations.set(event, { key: identity, source });
    return source;
  };
}
