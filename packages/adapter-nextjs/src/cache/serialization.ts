import {
  parseExperiencesHandoffEnvelope,
  type ExperiencesHandoff,
  type PortableRenderPlan,
} from '@contentful/experiences-node';

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
  state: ['profile'],
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
      for (const key of Object.keys(value)) {
        if (!/^(0|[1-9]\d*)$/.test(key))
          throw new TypeError(`Non-JSON array property at ${path}.${key}`);
        if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
          throw new TypeError(`Non-JSON accessor at ${path}[${key}]`);
      }
      return Array.from(value, (item, index) => copy(String(index), item));
    }
    return Object.fromEntries(
      Object.keys(value).flatMap((key) => {
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
  return jsonData(
    {
      ...(plan.experienceId === undefined ? {} : { experienceId: plan.experienceId }),
      nodes: plan.nodes,
      debug: plan.debug,
      diagnostics: [],
      metadata: Object.fromEntries(
        (options.metadataKeys ?? [])
          .filter((key) => Object.hasOwn(plan.metadata, key))
          .map((key) => [key, plan.metadata[key]])
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
export function serializeHandoff(
  handoff: ExperiencesHandoff,
  scope: Pick<ExperiencesHandoff, 'spaceId' | 'environmentId'>
): ExperiencesHandoff {
  return jsonData(parseExperiencesHandoffEnvelope(handoff, scope), 'handoff') as ExperiencesHandoff;
}

/** Safe for a JSON script body. This does not permit unsafe markup interpolation. */
export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(jsonData(value))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
