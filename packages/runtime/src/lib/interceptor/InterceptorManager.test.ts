import { describe, expect, it, vi } from 'vitest';
import { InterceptorManager } from './InterceptorManager.js';

describe('InterceptorManager', () => {
  it('chains synchronous and asynchronous handlers in registration order with isolated inputs', async () => {
    const manager = new InterceptorManager<{ nested: { value: number } }>();
    const input = { nested: { value: 1 } };
    let firstOutput!: typeof input;
    manager.add(async (value) => {
      value.nested.value += 1;
      firstOutput = value;
      return value;
    });
    manager.add((value) => {
      value.nested.value *= 3;
      return value;
    });

    await expect(manager.run(input)).resolves.toEqual({ nested: { value: 6 } });
    expect(input).toEqual({ nested: { value: 1 } });
    expect(firstOutput).toEqual({ nested: { value: 2 } });
  });

  it('snapshots registrations before an asynchronous handler settles', async () => {
    const manager = new InterceptorManager<number>();
    let release!: () => void;
    manager.add(
      (value) =>
        new Promise<number>((resolve) => {
          release = () => resolve(value + 1);
        })
    );
    const removed = manager.add((value) => value * 2);
    const running = manager.run(1);
    manager.remove(removed);
    manager.clear();
    manager.add((value) => value + 10);
    release();

    await expect(running).resolves.toBe(4);
    await expect(manager.run(1)).resolves.toBe(11);
  });

  it('tracks removals and clears without reusing registration identifiers', async () => {
    const manager = new InterceptorManager<number>();
    const id = manager.add((value) => value + 1);
    expect(manager.count()).toBe(1);
    expect(manager.remove(id)).toBe(true);
    expect(manager.remove(id)).toBe(false);
    const nextId = manager.add((value) => value * 2);
    manager.clear();
    expect(manager.count()).toBe(0);
    expect(manager.add((value) => value)).toBeGreaterThan(nextId);
  });

  it('returns the input when no handlers are registered', async () => {
    const manager = new InterceptorManager<object>();
    const input = { profile: { id: 'visitor' } };
    await expect(manager.run(input)).resolves.toBe(input);
  });

  it.each(['sync', 'async'] as const)(
    'propagates %s failures and stops the remaining chain',
    async (kind) => {
      const manager = new InterceptorManager<number>();
      const error = new Error('hook failed');
      manager.add(() => {
        if (kind === 'sync') throw error;
        return Promise.reject(error);
      });
      const later = vi.fn((value: number) => value);
      manager.add(later);

      await expect(manager.run(1)).rejects.toBe(error);
      expect(later).not.toHaveBeenCalled();
    }
  );

  it('supports sparse merges while distinguishing omitted state from explicit undefined', async () => {
    type State = { profile?: { id: string }; locale?: string };
    const manager = new InterceptorManager<State>();
    manager.add(() => ({ locale: 'de-DE' }));
    const next = vi.fn((value: Readonly<State>) => {
      expect(value).toEqual({ profile: { id: 'visitor' }, locale: 'de-DE' });
      return { profile: undefined };
    });
    manager.add(next);

    await expect(
      manager.run({ profile: { id: 'visitor' } }, (previous, value) => ({
        ...previous,
        ...value,
      }))
    ).resolves.toEqual({ profile: undefined, locale: 'de-DE' });
  });
});
