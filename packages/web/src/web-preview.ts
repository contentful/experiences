import {
  createRuntimePreviewClient,
  initializeRuntimeLivePreview,
  type ContentfulExperiencesConfig,
  type RuntimeLivePreviewBinding,
  type RuntimeLivePreviewInitializer,
} from '@contentful/experiences-runtime';
import { preview } from './signals/signals.js';
import type { PreviewState } from './states.js';

/** Owns one Preview Session and publishes through the SDK's normal state signal. */
export class WebPreview {
  #ready: Promise<RuntimeLivePreviewBinding>;
  #version = 0;
  // Local payload sequence; the package exposes no revision shared with HTTP snapshots.
  #sequence = 0;
  #destroyed = false;
  #unsubscribe: (() => void)[] = [];

  constructor(
    readonly config: ContentfulExperiencesConfig,
    initializer: RuntimeLivePreviewInitializer
  ) {
    this.#ready = this.#initialize(initializer);
  }
  ready(): Promise<RuntimeLivePreviewBinding> {
    return this.#ready;
  }
  get revision(): number {
    return this.#version;
  }

  async replace(initializer: RuntimeLivePreviewInitializer): Promise<void> {
    if (this.#destroyed) throw new Error('Preview owner has been destroyed');
    // The public client has no reconfiguration API; release it to change session/token.
    this.#stop();
    preview.value = undefined;
    this.#ready = this.#initialize(initializer);
    await this.#ready;
  }

  clear(): void {
    if (preview.peek()) this.#publish({ data: undefined, error: undefined });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#stop();
    preview.value = undefined;
  }

  #initialize(initializer: RuntimeLivePreviewInitializer): Promise<RuntimeLivePreviewBinding> {
    const version = this.#version;
    const ready = Promise.resolve()
      .then(() => initializeRuntimeLivePreview(initializer))
      .then((binding) => {
        if (!this.#current(version)) return binding;
        this.#publish({ experienceId: binding.experienceId, sessionId: binding.sessionId });
        void this.#connect(binding, version);
        return binding;
      })
      .catch((error: unknown) => {
        if (this.#current(version)) this.#publish({ error: asError(error), status: 'static' });
        throw error;
      });
    void ready.catch(() => {}); // State exposes failure even if no fetch joins initialization.
    return ready;
  }

  async #connect(binding: RuntimeLivePreviewBinding, version: number): Promise<void> {
    const own = (unsubscribe: () => void) =>
      this.#current(version) ? this.#unsubscribe.push(unsubscribe) : unsubscribe();
    try {
      const client = await createRuntimePreviewClient(binding, this.config);
      if (!this.#current(version)) return;
      // Client results retain data across status/error notifications and offer no clear.
      // Ignore unchanged payloads so a status notification cannot undo SDK reset.
      let lastData: PreviewState['data'];
      const update = () => {
        if (!this.#current(version)) return;
        const { data, error } = client.getResult();
        const changed = data !== lastData;
        lastData = data;
        this.#publish({ error, ...(changed ? { data, revision: ++this.#sequence } : {}) });
      };
      own(client.subscribe(update));
      if (!this.#current(version)) return;
      // Status is a separate subscription; editor reporting is an explicit package call.
      own(
        client.subscribeStatus((status) => {
          if (!this.#current(version)) return;
          binding.implementation.sendPreviewStatus(status);
          this.#publish({ status });
        })
      );
      update();
    } catch (error) {
      if (this.#current(version)) this.#publish({ error: asError(error), status: 'static' });
    }
  }

  #current(version: number): boolean {
    return !this.#destroyed && version === this.#version;
  }
  #stop(): void {
    this.#version++;
    for (const unsubscribe of this.#unsubscribe.splice(0)) unsubscribe();
  }
  #publish(update: Partial<PreviewState>): void {
    const current = preview.peek();
    if (
      current &&
      (Object.keys(update) as (keyof PreviewState)[]).every((key) => current[key] === update[key])
    )
      return;
    preview.value = {
      data: undefined,
      error: undefined,
      status: undefined,
      revision: this.#sequence,
      ...current,
      ...update,
    };
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
