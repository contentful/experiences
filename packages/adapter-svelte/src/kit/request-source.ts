import type { PreparationApplicability } from '@contentful/experiences-web';
import type { FetchExperienceOptions } from '@contentful/experiences-runtime';
import type { RequestResult } from './request-result.js';

export interface RequestCandidate {
  readonly routeKey: string;
  readonly experience?: FetchExperienceOptions;
  readonly result?: RequestResult;
  readonly error?: Error;
  readonly preparation?: PreparationApplicability;
  readonly locale?: string;
  readonly sessionId?: string;
  readonly resolveOptions?: object;
}

/** Content selection excludes event intent and continuity; parameters and locale remain meaningful. */
export function requestSelection(candidate: RequestCandidate): string {
  const { personalization: _personalization, ...selector } =
    candidate.experience ?? candidate.result?.experience ?? {};
  return (
    candidate.routeKey +
    '\n' +
    JSON.stringify(
      {
        experience: {
          ...selector,
          locale:
            (candidate.experience ?? candidate.result?.experience)?.locale ?? candidate.locale,
        },
        resolveOptions: candidate.resolveOptions ?? {},
      },
      (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([, value]) => value !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
            )
          : value
    )
  );
}

declare const requestSource: unique symbol;
/** Opaque universal-load handle, rebuilt from Kit's captured endpoint response. */
export interface ManagedRequestSource {
  readonly [requestSource]: true;
}

interface SourceState {
  readonly candidate: RequestCandidate;
  readonly read?: () => Promise<RequestCandidate>;
}
const sources = new WeakMap<ManagedRequestSource, SourceState>();

function state(source: ManagedRequestSource): SourceState {
  const value = sources.get(source);
  if (!value) throw new TypeError('Expected the original managed Experience source.');
  return value;
}

export function createRequestSource(
  candidate: RequestCandidate,
  read?: SourceState['read']
): ManagedRequestSource {
  const source = {} as ManagedRequestSource;
  sources.set(source, { candidate, read });
  return source;
}

export function getRequestSourceState(source: ManagedRequestSource): RequestCandidate {
  return state(source).candidate;
}

/** Reads never mutate the acquired native outcome or create new visit intent. */
export function readRequestSource(source: ManagedRequestSource): Promise<RequestCandidate> {
  const value = state(source);
  return value.read ? value.read() : Promise.resolve(value.candidate);
}
