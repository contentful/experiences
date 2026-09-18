import { getResolvedDesign } from './context.js';

/**
 * Read the current node's resolved design values (token-resolved). Returns
 * `{}` when there's no design in scope. Read it inside a `$derived` to stay
 * current.
 *
 * Pass a type argument to shape the bag:
 *
 *   const design = $derived(getDesignValues<{ as?: 'h1' | 'h2' }>());
 *
 * `T` is a convenience assertion, not validated at runtime — treat keys as
 * possibly `undefined`.
 */
export function getDesignValues<T extends object = Record<string, unknown>>(): T {
  return (getResolvedDesign() ?? {}) as T;
}
