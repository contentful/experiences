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
  createNextjsRequestContext,
  type CreateNextjsRequestContextOptions,
  type NextjsCookieReader,
} from './request-context.js';

export interface BindNextjsExperiencesRequestOptions
  extends
    Omit<RequestContext, 'consent' | 'eventContext' | 'locale'>,
    CreateNextjsRequestContextOptions {
  readonly consent: ConsentInput;
  readonly cookies?: NextjsCookieReader;
  readonly anonymousIdCookieName?: string;
}

export function configureNextjsServerExperiences(config: NodeConfig): ContentfulExperiences {
  return new ContentfulExperiences(config);
}

export function bindNextjsExperiencesRequest(
  sdk: ContentfulExperiences,
  options: BindNextjsExperiencesRequestOptions
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
  const isPreview = options.isPreview === true || options.livePreview !== undefined;
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
    eventContext: createNextjsRequestContext(options),
  });
}
