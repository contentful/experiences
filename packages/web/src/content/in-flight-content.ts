import type { FetchResolveOptions } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { cloneDeepWith } from 'es-toolkit';

function clonePlan(plan: PortableRenderPlan): PortableRenderPlan {
  return cloneDeepWith(plan, (value) => {
    if (!(value instanceof Error)) return undefined;
    // Error causes can contain caller-owned functions and other opaque values.
    return Object.defineProperties(
      Object.setPrototypeOf(new Error(), Object.getPrototypeOf(value)),
      {
        ...Object.getOwnPropertyDescriptors(value),
        stack: { value: value.stack, writable: true, configurable: true },
      }
    );
  });
}
/** One SDK-owned map shares only current in-flight content work, never completed resources. */
export class InFlightContent {
  readonly #pendingContent = new Map<
    FetchResolveOptions['config'],
    Map<string, Promise<PortableRenderPlan>>
  >();
  clear(): void {
    this.#pendingContent.clear();
  }

  share(
    key: string | undefined,
    resolve: FetchResolveOptions,
    load: () => Promise<PortableRenderPlan>
  ): Promise<PortableRenderPlan> {
    if (key === undefined) return load();
    let pending = this.#pendingContent.get(resolve.config);
    if (!pending) this.#pendingContent.set(resolve.config, (pending = new Map()));
    const existing = pending.get(key);
    if (existing) return existing.then(clonePlan);
    const promise = load().finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
      if (!pending.size && this.#pendingContent.get(resolve.config) === pending)
        this.#pendingContent.delete(resolve.config);
    });
    pending.set(key, promise);
    return promise.then(clonePlan);
  }
}
