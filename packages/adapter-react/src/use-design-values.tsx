'use client';

import { useResolvedDesign } from './context';

/**
 * Read the current node's resolved design values (viewport-cascaded +
 * token-resolved). Returns `{}` when there's no design in scope.
 *
 * Pass a type argument to shape the bag, like `useState<T>()`:
 *
 *   const design = useDesignValues<{ as?: 'h1' | 'h2' }>();
 *
 * `T` is a convenience assertion, not validated at runtime — treat keys as
 * possibly `undefined`.
 */
export function useDesignValues<T extends object = Record<string, unknown>>(): T {
  return (useResolvedDesign() ?? {}) as T;
}
