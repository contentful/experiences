import {
  parseExperiencesHandoffEnvelope,
  type ExperiencesHandoff,
  type PortableRenderPlan,
  assertExperienceSelector,
  isNotFoundError,
  isPreviewSessionFetchError,
  type FetchExperienceOptions,
} from '@contentful/experiences-node';
import type {
  RequestContentErrorKind,
  RequestPagePayload,
  RequestResult,
} from './request-result.js';
import type { PreviewConfig } from '@contentful/experiences-runtime';

// Only these SDK fields may be absent; customer records always use strict JSON copying.
const optionals = {
  node: ['nodeId', 'attribution'],
  props: ['resolved'],
  nodeAttribution: ['entryIds'],
  scope: [
    'entityKindId',
    'optimizationId',
    'variantId',
    'variantIndex',
    'parentExperienceId',
    'parentVariantId',
    'entryIds',
  ],
  handoff: ['state', 'profileId', 'replay'],
  state: ['profile', 'changes'],
  profile: ['jurisdiction'],
  session: ['id'],
  profilePage: ['title'],
  cache: ['key', 'tags'],
  replay: ['locale'],
  context: ['app', 'gdpr', 'locale', 'location', 'page', 'screen', 'userAgent'],
  page: ['title', 'hash', 'width', 'height'],
  pageProperties: ['hash', 'width', 'height', 'category'],
  campaign: ['name', 'source', 'medium', 'term', 'content'],
  location: [
    'coordinates',
    'city',
    'postalCode',
    'region',
    'regionCode',
    'country',
    'countryCode',
    'continent',
    'timezone',
  ],
};
const children = {
  plan: { nodes: 'nodes', attribution: 'planAttribution' },
  nodes: 'node',
  node: { props: 'props', slots: 'slots', attribution: 'nodeAttribution' },
  slots: 'nodes',
  planAttribution: { scopes: 'scopes' },
  nodeAttribution: { scopes: 'scopes', roots: 'scopes' },
  scopes: 'scope',
  handoff: { cache: 'cache', state: 'state', replay: 'replay' },
  state: { profile: 'profile' },
  profile: { location: 'location', session: 'session' },
  session: { landingPage: 'profilePage' },
  replay: { events: 'events' },
  events: 'event',
  event: { context: 'context' },
  context: { page: 'page', campaign: 'campaign', location: 'location' },
} as const;
type Projection = keyof typeof optionals | keyof typeof children;

function jsonData(
  value: unknown,
  kind?: Projection,
  path = '$',
  ancestors = new Set<object>()
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new TypeError(`Non-JSON value at ${path}: ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError(`Non-JSON cycle at ${path}`);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`Non-JSON class instance at ${path}`);
  if (Object.getOwnPropertySymbols(value).length)
    throw new TypeError(`Non-JSON symbol key at ${path}`);
  const fields: Record<string, Projection> | Projection | undefined =
    kind && children[kind as keyof typeof children];
  const absent = optionals[kind as keyof typeof optionals];
  const copy = (key: string, item: unknown) => {
    const child =
      kind === 'event' &&
      key === 'properties' &&
      Object.getOwnPropertyDescriptor(value, 'type')?.value === 'page'
        ? 'pageProperties'
        : typeof fields === 'string'
          ? fields
          : fields && Object.hasOwn(fields, key)
            ? fields[key]!
            : undefined;
    return jsonData(item, child, array ? `${path}[${key}]` : `${path}.${key}`, ancestors);
  };
  ancestors.add(value);
  try {
    if (array) {
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === 'length') continue;
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
          throw new TypeError(`Non-JSON array property at ${path}.${key}`);
        if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
          throw new TypeError(`Non-JSON accessor at ${path}[${key}]`);
      }
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor))
          throw new TypeError(`Non-JSON array item at ${path}[${index}]`);
        return copy(String(index), descriptor.value);
      });
    }
    return Object.fromEntries(
      Object.getOwnPropertyNames(value).flatMap((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw new TypeError(`Non-JSON accessor at ${path}.${key}`);
        return descriptor.value === undefined && absent?.includes(key)
          ? []
          : [[key, copy(key, descriptor.value)]];
      })
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Project browser data deliberately; server errors and metadata remain server-local by default. */
export function serializePlan(
  plan: PortableRenderPlan,
  options: { readonly metadataKeys?: readonly string[] } = {}
): PortableRenderPlan {
  assertDataRecord(plan);
  assertDataRecord(plan.metadata);
  if (plan.attribution !== undefined) assertDataRecord(plan.attribution);
  return jsonData(
    {
      ...(plan.experienceId === undefined ? {} : { experienceId: plan.experienceId }),
      nodes: plan.nodes,
      debug: plan.debug,
      diagnostics: [],
      metadata: Object.fromEntries(
        (options.metadataKeys ?? [])
          .filter((key) => Object.hasOwn(plan.metadata, key))
          .map((key) => [key, field(plan.metadata, key)])
      ),
      ...(plan.sourceMap === undefined ? {} : { sourceMap: plan.sourceMap }),
      ...(plan.attribution === undefined
        ? {}
        : { attribution: { scopes: plan.attribution.scopes } }),
    },
    'plan'
  ) as PortableRenderPlan;
}

/** Preserve canonical evaluated events, continuation identity and complete profile state. */
function projectHandoff(
  handoff: unknown,
  scope: Pick<ExperiencesHandoff, 'spaceId' | 'environmentId'>
): ExperiencesHandoff {
  // Check before schema parsing so getters and unsupported JSON cannot be silently stripped.
  const plain = jsonData(handoff, 'handoff');
  return jsonData(parseExperiencesHandoffEnvelope(plain, scope), 'handoff') as ExperiencesHandoff;
}

/** Server-local operation before privacy projection. Raw errors never cross this boundary. */
export interface RawRequestResult<E extends FetchExperienceOptions = FetchExperienceOptions> {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: E;
  readonly plan?: PortableRenderPlan;
  readonly error?: unknown;
  readonly redirect?: { readonly path: string };
  readonly handoff?: unknown;
  readonly initialPageOwner?: 'server';
  readonly initialPagePayload?: RequestPagePayload;
  readonly preview?: Pick<PreviewConfig, 'sessionHost' | 'resourceResolution'>;
  readonly eventFree?: boolean;
}

export interface RequestProjectionOptions {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly metadataKeys?: readonly string[];
  readonly prerender?: boolean;
  readonly isPreview?: boolean;
}

const errorMessages: Record<RequestContentErrorKind, string> = {
  'not-found': 'Experience content not found.',
  preview:
    'Preview Session content unavailable. Retry, or reopen preview if the session has expired.',
  authorization: 'Experience content access denied.',
  unavailable: 'Experience content unavailable.',
};

function errorKind(error: unknown): RequestContentErrorKind {
  if (isPreviewSessionFetchError(error)) return 'preview';
  if (isNotFoundError(error)) return 'not-found';
  if (error && typeof error === 'object') {
    const failure = error as {
      name?: unknown;
      statusCode?: unknown;
      cause?: { statusCode?: unknown };
    };
    const status =
      failure.name === 'ExperienceFetchError' ? failure.cause?.statusCode : failure.statusCode;
    if (status === 401 || status === 403) return 'authorization';
    if (failure.name === 'ExperienceFetchError' && status === 404) return 'not-found';
  }
  return 'unavailable';
}

function assertDataRecord(value: object): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('Non-JSON class instance');
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Non-JSON symbol key');
  for (const key of Object.getOwnPropertyNames(value)) field(value, key);
}

/** Read only an explicitly selected data property; never invoke application accessors. */
function field(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new TypeError(`Non-JSON accessor at $.${key}`);
  return descriptor.value;
}

/** Native Kit serialization receives this finite, deliberately projected result. */
export function projectRequestResult<E extends FetchExperienceOptions>(
  raw: RawRequestResult<E>,
  options: RequestProjectionOptions
): RequestResult<E> {
  // Selector validation precedes normalization; private personalization is never copied.
  assertDataRecord(raw);
  assertDataRecord(raw.experience);
  assertExperienceSelector(raw.experience);
  const selector: Record<string, unknown> = {};
  for (const key of [
    'experienceId',
    'destinationId',
    'nodeId',
    'path',
    'locale',
    'parameters',
    'extensions',
  ]) {
    const value = field(raw.experience, key);
    if (value !== undefined) selector[key] = value;
  }
  const intent = raw.experience.personalization;
  if (intent !== undefined) assertDataRecord(intent);
  const events = intent?.events;
  if (events !== undefined) {
    if (
      !Array.isArray(events) ||
      Object.getPrototypeOf(events) !== Array.prototype ||
      Object.getOwnPropertySymbols(events).length
    )
      throw new TypeError('Non-JSON event array');
    for (const key of Object.getOwnPropertyNames(events)) {
      if (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= events.length))
        throw new TypeError('Non-JSON event array property');
    }
    let hasPage = false;
    for (let index = 0; index < events.length; index++) {
      const event = field(events, String(index));
      if (typeof event !== 'object' || event === null) throw new TypeError('Non-JSON event');
      assertDataRecord(event);
      if (field(event, 'type') === 'page') hasPage = true;
    }
    if (!hasPage) selector.personalization = { events: [] };
  }
  const handoff = raw.handoff === undefined ? undefined : projectHandoff(raw.handoff, options);
  if (
    options.prerender &&
    (raw.plan?.personalization !== undefined ||
      intent?.profileId !== undefined ||
      intent?.events !== undefined ||
      handoff?.profileId !== undefined ||
      handoff?.state?.profile !== undefined ||
      handoff?.state?.changes !== undefined ||
      handoff?.replay !== undefined)
  ) {
    throw new TypeError('Prerender cannot include visitor identity, state, events or replay.');
  }
  if (
    options.isPreview &&
    handoff !== undefined &&
    (handoff.state !== undefined || handoff.profileId !== undefined || handoff.replay !== undefined)
  ) {
    throw new TypeError('Preview results cannot transfer visitor state or replay.');
  }
  if (raw.redirect !== undefined) assertDataRecord(raw.redirect);
  const kind = raw.error === undefined ? undefined : errorKind(raw.error);
  const preview: Record<string, unknown> = {};
  if (raw.preview !== undefined) {
    assertDataRecord(raw.preview);
    for (const key of ['sessionHost', 'resourceResolution']) {
      const value = field(raw.preview, key);
      if (value !== undefined) preview[key] = value;
    }
  }
  return jsonData({
    requestId: raw.requestId,
    routeKey: raw.routeKey,
    experience: selector,
    ...(raw.plan === undefined ? {} : { plan: serializePlan(raw.plan, options) }),
    ...(raw.redirect === undefined ? {} : { redirect: { path: field(raw.redirect, 'path') } }),
    ...(kind === undefined ? {} : { contentError: errorMessages[kind], contentErrorKind: kind }),
    ...(kind === 'not-found' ? { notFound: true } : {}),
    ...(handoff === undefined ? {} : { handoff }),
    ...(raw.initialPageOwner === undefined ? {} : { initialPageOwner: raw.initialPageOwner }),
    ...(raw.initialPagePayload === undefined ? {} : { initialPagePayload: raw.initialPagePayload }),
    ...(raw.preview === undefined ? {} : { preview }),
    ...(raw.eventFree === undefined ? {} : { eventFree: raw.eventFree }),
  }) as RequestResult<E>;
}
