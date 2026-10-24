import { describe, expect, it, vi } from 'vitest';
import { InterceptorManager } from './InterceptorManager.js';

describe('InterceptorManager', () => {
  it('chains synchronous and asynchronous handlers in registration order', async () => {
    const manager = new InterceptorManager<{ nested: { value: number } }>();
    const input = { nested: { value: 1 } };
    manager.add(async (value) => {
      value.nested.value += 1;
      return value;
    });
    manager.add((value) => {
      value.nested.value *= 3;
      return value;
    });

    await expect(manager.run(input)).resolves.toEqual({ nested: { value: 6 } });
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

  it('stops the remaining chain after a handler rejects', async () => {
    const manager = new InterceptorManager<number>();
    const error = new Error('hook failed');
    manager.add(async () => {
      throw error;
    });
    const later = vi.fn((value: number) => value);
    manager.add(later);
    await expect(manager.run(1)).rejects.toBe(error);
    expect(later).not.toHaveBeenCalled();
  });

  it('applies the caller merge to the previous value and handler result', async () => {
    const manager = new InterceptorManager<number>();
    manager.add((value) => value * 2);
    await expect(manager.run(3, (previous, next) => previous + next)).resolves.toBe(9);
  });
});
