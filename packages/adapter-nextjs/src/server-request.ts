import {
  ANONYMOUS_ID_COOKIE,
  ContentfulExperiences,
  type ConsentInput,
  type Config as NodeConfig,
  type RequestRuntime,
  type RequestContext,
} from '@contentful/experiences-node';
import {
  cookieReaderFromHeader,
  createRequestContext,
  type CreateRequestContextOptions,
  type CookieReader,
} from './request-context.js';

export interface BindExperiencesRequestOptions
  extends Omit<RequestContext, 'consent' | 'eventContext' | 'locale'>, CreateRequestContextOptions {
  readonly consent: ConsentInput;
  readonly cookies?: CookieReader;
  readonly anonymousIdCookieName?: string;
}

export function configureServerExperiences(config: NodeConfig): ContentfulExperiences {
  return new ContentfulExperiences(config);
}

export function bindExperiencesRequest(
  sdk: ContentfulExperiences,
  options: BindExperiencesRequestOptions
): RequestRuntime {
  if (options.consent === undefined) throw new TypeError('Explicit request consent is required');
  const {
    cookies,
    headers,
    request: incoming,
    page: _page,
    anonymousIdCookieName,
    ...context
  } = options;
  const isPreview =
    options.isPreview === true ||
    options.preview?.sessionId !== undefined ||
    sdk.config.preview?.sessionId !== undefined;
  const canReadIdentity =
    !isPreview &&
    options.profile === undefined &&
    (options.consent === true ||
      (options.consent !== false && options.consent.persistence === true));
  const reader = canReadIdentity
    ? (cookies ??
      (headers
        ? cookieReaderFromHeader(headers.get('cookie'))
        : (incoming?.cookies ?? cookieReaderFromHeader(incoming?.headers.get('cookie') ?? null))))
    : undefined;
  const id = reader?.get(anonymousIdCookieName ?? ANONYMOUS_ID_COOKIE)?.value;
  return sdk.forRequest({
    ...context,
    profile: isPreview ? undefined : (options.profile ?? (id ? { id } : undefined)),
    eventContext: createRequestContext(options),
  });
}
