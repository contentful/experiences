import type { UniversalEventBuilderArgs } from '@contentful/experiences-node';

export const NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX = 'x-ctfl-exp-';
export const NEXTJS_EXPERIENCES_REQUEST_URL_HEADER = `${NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX}request-url`;

export interface NextjsCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/** @internal An absent effective header is authoritative, including cookie removal. */
export function cookieReaderFromHeader(header: string | null): NextjsCookieReader {
  return {
    get(name) {
      for (const part of (header ?? '').split(';')) {
        const index = part.indexOf('=');
        if (index < 0 || part.slice(0, index).trim() !== name) continue;
        const value = part
          .slice(index + 1)
          .trim()
          .replace(/^"(.*)"$/, '$1');
        try {
          return { value: decodeURIComponent(value) };
        } catch {
          return { value };
        }
      }
      return undefined;
    },
  };
}

export interface NextjsRequestLike {
  readonly url: string;
  readonly headers: globalThis.Headers;
  readonly cookies?: NextjsCookieReader;
}

export type NextjsSearchParams =
  globalThis.URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface CreateNextjsPageContextOptions {
  readonly path: string;
  readonly origin?: string;
  readonly url?: string;
  readonly referrer?: string;
  readonly searchParams?: NextjsSearchParams;
}

export type NextjsPageContextInput =
  NonNullable<UniversalEventBuilderArgs['page']> | CreateNextjsPageContextOptions;

export interface CreateNextjsRequestContextOptions {
  readonly request?: NextjsRequestLike;
  /** Explicit headers are authoritative, including removals. */
  readonly headers?: globalThis.Headers;
  readonly page?: NextjsPageContextInput;
  readonly eventContext?: UniversalEventBuilderArgs;
  readonly locale?: string;
}

/** @internal Shared by route keys and SDK-owned middleware forwarding. */
export function normalizedRequestUrl(input: string | URL): URL {
  const url = new URL(input.toString(), 'https://nextjs.invalid');
  url.hash = '';
  url.searchParams.delete('_rsc');
  url.search = url.searchParams.toString();
  return url;
}

/** Path and ordered query values; host base-path/locale/trailing-slash policy remains explicit. */
export function createNextjsRouteKey(input: string | URL): string {
  const url = normalizedRequestUrl(input);
  return `${url.pathname}${url.search}`;
}

export function createNextjsPageContext({
  path,
  origin,
  url,
  referrer,
  searchParams,
}: CreateNextjsPageContextOptions): NonNullable<UniversalEventBuilderArgs['page']> {
  const params = new globalThis.URLSearchParams();
  if (searchParams instanceof globalThis.URLSearchParams) {
    searchParams.forEach((value, key) => params.append(key, value));
  } else {
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      for (const item of typeof value === 'string' ? [value] : (value ?? []))
        params.append(key, item);
    }
  }
  const search = params.size ? `?${params}` : '';
  const query = Object.fromEntries(params);
  return {
    path,
    search,
    query,
    referrer: referrer ?? '',
    url: url ?? (origin ? new URL(`${path}${search}`, origin).toString() : `${path}${search}`),
  };
}

/** Derived request page < event context < explicit page; explicit locale wins. No IP inference. */
export function createNextjsRequestContext(
  options: CreateNextjsRequestContextOptions
): UniversalEventBuilderArgs {
  const { request, eventContext, page, locale } = options;
  const headers = options.headers ?? request?.headers;
  const url = request?.url ?? headers?.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER);
  const parsedUrl = url ? new URL(url) : undefined;
  const derived = parsedUrl
    ? {
        path: parsedUrl.pathname,
        search: parsedUrl.search,
        query: Object.fromEntries(parsedUrl.searchParams),
        url: parsedUrl.toString(),
        referrer: headers?.get('referer') ?? eventContext?.page?.referrer ?? '',
      }
    : undefined;
  const provided =
    page &&
    ('query' in page && 'search' in page && 'url' in page ? page : createNextjsPageContext(page));
  const base = derived ?? eventContext?.page ?? provided;
  const mergedPage = base ? { ...base, ...eventContext?.page, ...provided } : undefined;
  return {
    ...eventContext,
    ...(mergedPage ? { page: mergedPage } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(eventContext?.userAgent === undefined && headers?.has('user-agent')
      ? { userAgent: headers.get('user-agent')! }
      : {}),
  };
}
