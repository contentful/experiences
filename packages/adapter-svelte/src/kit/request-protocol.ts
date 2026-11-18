import { assertExperienceSelector } from '@contentful/experiences-client';
import {
  UniversalEventBuilderArgs as EventContextSchema,
  type ConsentInput,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
export interface PreparationInput {
  operation: 'prepare' | 'read';
  routeKey: string;
  experience: FetchExperienceOptions;
  resolveOptions?: Omit<FetchResolveOptions, 'config'>;
  profileId?: string;
  locale?: string;
  consent?: ConsentInput;
  eventContext?: UniversalEventBuilderArgs;
}

const MAX_BODY_BYTES = 64 * 1024;

/** A local committed route, retaining its original search string. */
export function assertRouteKey(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\#]/.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  ) {
    throw new TypeError('Expected a local routeKey without a fragment.');
  }
  const url = new URL(value, 'https://experiences.invalid');
  if (value !== url.pathname + url.search) {
    throw new TypeError('Expected a canonical pathname and original search string.');
  }
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected an object.');
  }
}

function fields(value: unknown, allowed: readonly string[]) {
  record(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError('Unsupported preparation field.');
  }
  return value;
}

function jsonData(value: unknown, depth = 0): void {
  if (depth > 24) throw new TypeError('Preparation data is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item) => jsonData(item, depth + 1));
    return;
  }
  record(value);
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new TypeError('Unsupported preparation key.');
    }
    jsonData(item, depth + 1);
  }
}

/** Validate the public boundary before any authorization, Node facade or event work. */
export function parsePreparationInput(value: unknown): PreparationInput {
  jsonData(value);
  const input = fields(value, [
    'operation',
    'routeKey',
    'experience',
    'resolveOptions',
    'profileId',
    'locale',
    'consent',
    'eventContext',
  ]);
  if (input.operation !== 'prepare' && input.operation !== 'read') {
    throw new TypeError('Unsupported preparation operation.');
  }
  assertRouteKey(input.routeKey);
  const experience = fields(input.experience, [
    'experienceId',
    'destinationId',
    'nodeId',
    'path',
    'locale',
    'parameters',
    'extensions',
    'personalization',
  ]);
  assertExperienceSelector(experience);
  if (experience.locale !== undefined && typeof experience.locale !== 'string') {
    throw new TypeError('Invalid locale.');
  }
  if (experience.parameters !== undefined) {
    record(experience.parameters);
    for (const parameter of Object.values(experience.parameters)) {
      if (typeof parameter === 'string' || typeof parameter === 'number') continue;
      record(parameter);
      if (
        Object.values(parameter).some(
          (leaf) => typeof leaf !== 'string' && typeof leaf !== 'number'
        )
      ) {
        throw new TypeError('Invalid Experience parameters.');
      }
    }
  }
  if (experience.extensions !== undefined) {
    const extensions = fields(experience.extensions, ['sourceMap']);
    if (extensions.sourceMap !== undefined) fields(extensions.sourceMap, []);
  }
  if (experience.personalization !== undefined) {
    const personalization = fields(experience.personalization, [
      'profileId',
      'events',
      'preflight',
    ]);
    if (personalization.profileId !== undefined && typeof personalization.profileId !== 'string')
      throw new TypeError('Invalid profile.');
    if (personalization.preflight !== undefined && typeof personalization.preflight !== 'boolean') {
      throw new TypeError('Invalid preflight.');
    }
    if (personalization.events !== undefined && !Array.isArray(personalization.events)) {
      throw new TypeError('Invalid events.');
    }
  }
  if (input.resolveOptions !== undefined) {
    const resolve = fields(input.resolveOptions, ['metadata', 'debug']);
    if (resolve.metadata !== undefined) record(resolve.metadata);
    if (resolve.debug !== undefined && typeof resolve.debug !== 'boolean')
      throw new TypeError('Invalid debug.');
  }
  for (const name of ['locale', 'profileId']) {
    if (input[name] !== undefined && typeof input[name] !== 'string')
      throw new TypeError(`Invalid ${name}.`);
  }
  if (input.consent !== undefined && typeof input.consent !== 'boolean') {
    const consent = fields(input.consent, ['events', 'persistence']);
    if (Object.values(consent).some((item) => typeof item !== 'boolean'))
      throw new TypeError('Invalid consent.');
  }
  if (input.eventContext !== undefined) {
    fields(input.eventContext, ['campaign', 'locale', 'location', 'page', 'screen', 'userAgent']);
    input.eventContext = EventContextSchema.parse(input.eventContext);
  }
  return input as unknown as PreparationInput;
}

/** Read the stream with a real byte limit, regardless of Content-Length. */
export async function readPreparationRequest(
  request: globalThis.Request
): Promise<PreparationInput> {
  if (
    request.method !== 'POST' ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new TypeError('Preparation requires a JSON POST.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new TypeError('Missing preparation body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new TypeError('Preparation body exceeds 64 KiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parsePreparationInput(
    JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes))
  );
}
