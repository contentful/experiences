'use client';

import { useCallback } from 'react';
import type { CurrentPageOptions, PageViewBuilderArgs } from '@contentful/experiences-web';
import type {
  ExperiencesProviderProps,
  ExperiencesRootProps,
} from '../runtime/experiences-provider.js';

export type AutoPagePayload = PageViewBuilderArgs;

export interface AutoPageEmissionContext<TRouteContext> {
  readonly context: TRouteContext;
  readonly routeKey: string;
  readonly isInitialEmission: boolean;
}

export interface AutoPagePayloadOptions<TRouteContext> {
  readonly pagePayload?: AutoPagePayload;
  readonly getPagePayload?: (
    context: AutoPageEmissionContext<TRouteContext>
  ) => AutoPagePayload | undefined;
}

type RouterOwnedProps = 'routeKey' | 'buildPagePayload' | 'initialPagePayload';
export type RouterRootProps<TRouteContext> = Omit<ExperiencesRootProps, RouterOwnedProps> &
  AutoPagePayloadOptions<TRouteContext>;
export type RouterProviderProps<TRouteContext> = Omit<ExperiencesProviderProps, RouterOwnedProps> &
  AutoPagePayloadOptions<TRouteContext>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function mergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...base, ...override }).map(([key, value]) => [
      key,
      isRecord(base[key]) && isRecord(value) ? mergeRecords(base[key], value) : value,
    ])
  );
}

/** Nested-record composition follows the pinned page-payload convention; later layers win. */
export function composePagePayload(
  ...layers: ReadonlyArray<AutoPagePayload | undefined>
): AutoPagePayload {
  return layers.reduce<Record<string, unknown>>(
    (result, layer) => (layer === undefined ? result : mergeRecords(result, layer)),
    {}
  ) as AutoPagePayload;
}

export function buildAutoPagePayload<TRouteContext>(
  routerPayload: AutoPagePayload,
  options: AutoPagePayloadOptions<TRouteContext>,
  context: AutoPageEmissionContext<TRouteContext>
): AutoPagePayload {
  return composePagePayload(routerPayload, options.pagePayload, options.getPagePayload?.(context));
}

export function buildRouterPagePayload({
  hash,
  pathname,
  search,
  url,
}: {
  hash: string;
  pathname: string;
  search: string;
  url: string;
}): AutoPagePayload {
  const params = new globalThis.URLSearchParams(search);
  const query = Object.fromEntries(
    Array.from(new Set(params.keys()), (key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? (values[0] ?? '') : values];
    })
  );
  let absoluteUrl = url;
  if (typeof window !== 'undefined') {
    try {
      absoluteUrl = new URL(url, window.location.origin).toString();
    } catch {
      // Preserve the router value when it cannot be resolved against the browser origin.
    }
  }
  return {
    properties: {
      hash: hash === '' || hash.startsWith('#') ? hash : `#${hash}`,
      path: pathname,
      query,
      search,
      url: absoluteUrl,
    },
  };
}

/** Supply intent to the existing sequence; event construction and admission remain SDK-owned. */
export function useRouterPageInputs<TRouteContext>(
  routerPayload: AutoPagePayload,
  { pagePayload, getPagePayload }: AutoPagePayloadOptions<TRouteContext>,
  context: TRouteContext,
  routeKey: string
) {
  const buildPagePayload = useCallback<CurrentPageOptions['buildPayload']>(
    ({ isInitialEmission }) =>
      buildAutoPagePayload(
        routerPayload,
        { pagePayload, getPagePayload },
        { context, routeKey, isInitialEmission }
      ),
    [routerPayload, pagePayload, getPagePayload, context, routeKey]
  );
  return { routeKey, buildPagePayload };
}
