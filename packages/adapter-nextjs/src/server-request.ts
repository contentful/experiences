import { resolvePreviewSession } from './preview.js';
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
  createEventContext,
  type CreateEventContextOptions,
  type CookieReader,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';

export interface BindExperiencesRequestOptions
  extends
    Omit<RequestContext, 'consent' | 'eventContext' | 'locale' | 'preview'>,
    CreateEventContextOptions {
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
  const preview = resolvePreviewSession(
    sdk.config.preview,
    incoming?.url ?? headers?.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER) ?? '/'
  );
  const isPreview = preview !== undefined;
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
    preview,
    profile: isPreview ? undefined : (options.profile ?? (id ? { id } : undefined)),
    eventContext: createEventContext(options),
  });
}
