import {
  createRuntimePreviewClient,
  type Config,
  type RuntimePreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { signal, type Signal } from '@preact/signals-core';
import type { PreviewState } from './states.js';

/** Finish every cleanup before propagating a subscriber or transport error. */
export function disposePreview(disposers: Iterable<() => void>): void {
  const errors: unknown[] = [];
  for (const dispose of disposers) {
    try {
      dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
}

/** One Preview connection for the SDK's editor session context. */
export class WebPreview {
  readonly state;
  #started = false;
  #destroyed = false;
  #sequence = 0;
  readonly #unsubscribe: (() => void)[] = [];

  constructor(
    private readonly config: Config,
    private readonly options: RuntimePreviewSessionOptions,
    state: Signal<PreviewState | undefined> = signal()
  ) {
    this.state = state;
    this.state.value = {
      sessionId: options.sessionId,
      data: undefined,
      error: undefined,
      status: undefined,
      revision: 0,
    };
  }

  start(): void {
    if (this.#started || this.#destroyed) return;
    this.#started = true;
    void this.#connect().catch((error: unknown) => {
      if (!this.#destroyed)
        this.#publish({
          error: error instanceof Error ? error : new Error(String(error)),
          status: 'static',
        });
    });
  }

  async #connect(): Promise<void> {
    const client = await createRuntimePreviewClient(this.options, this.config);
    if (this.#destroyed) return;
    if (!client) {
      this.#publish({ status: 'static' });
      return;
    }
    const own = (stop: () => void) => (this.#destroyed ? stop() : this.#unsubscribe.push(stop));
    // Status notifications retain the package's last payload; do not undo SDK reset.
    let lastData: PreviewState['data'];
    const update = () => {
      if (this.#destroyed) return;
      const { data, error } = client.getResult();
      const changed = data !== lastData;
      lastData = data;
      this.#publish({ error, ...(changed ? { data, revision: ++this.#sequence } : {}) });
    };
    own(client.subscribe(update));
    if (this.#destroyed) return;
    own(
      client.subscribeStatus((status) => {
        if (!this.#destroyed) {
          this.#publish({ status });
          if (!this.#destroyed && typeof window !== 'undefined')
            window.parent?.postMessage(
              { source: 'experiences/live-preview', type: 'status', status },
              '*'
            );
        }
      })
    );
    update();
  }

  clear(): void {
    this.#publish({ data: undefined, error: undefined });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    disposePreview([
      ...this.#unsubscribe.splice(0),
      () => {
        this.state.value = undefined;
      },
    ]);
  }

  #publish(update: Partial<PreviewState>): void {
    if (this.#destroyed) return;
    const current = this.state.peek()!;
    if (
      (Object.keys(update) as (keyof PreviewState)[]).every((key) => current[key] === update[key])
    )
      return;
    this.state.value = { ...current, ...update };
  }
}
