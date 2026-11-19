import type { FetchResolveOptions } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { DestinationRedirectResult } from '@contentful/experiences-client';
import { cloneDeepWith } from 'es-toolkit';

function clonePlan<T extends PortableRenderPlan | DestinationRedirectResult>(plan: T): T {
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

/** Shares only current in-flight work; each shared consumer receives detached content. */
export class InFlightContent {
  readonly #pending = new Map<
    FetchResolveOptions['config'],
    Map<string, Promise<PortableRenderPlan | DestinationRedirectResult>>
  >();

  share<T extends PortableRenderPlan | DestinationRedirectResult>(
    key: string | undefined,
    resolve: FetchResolveOptions,
    load: () => Promise<T>
  ): Promise<T> {
    if (key === undefined) return load();
    let pending = this.#pending.get(resolve.config);
    if (!pending) this.#pending.set(resolve.config, (pending = new Map()));
    const existing = pending.get(key);
    if (existing) return existing.then((value) => clonePlan(value as T));
    const promise = load().finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
      if (!pending.size && this.#pending.get(resolve.config) === pending)
        this.#pending.delete(resolve.config);
    });
    pending.set(key, promise);
    return promise.then(clonePlan);
  }

  clear(): void {
    this.#pending.clear();
  }
}
