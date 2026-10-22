import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import { staticObservable, toDistinctObservable, toObservable } from './Observable.js';

describe('Observable helpers', () => {
  it('exposes a static value through both subscription forms', () => {
    const observable = staticObservable(false);
    const values: boolean[] = [];
    observable.subscribe((value) => values.push(value)).unsubscribe();
    observable.subscribeOnce((value) => values.push(value)).unsubscribe();
    expect(observable.current).toBe(false);
    expect(values).toEqual([false, false]);
  });

  it('suppresses equivalent values using the supplied comparator', () => {
    const source = signal({ count: 1 });
    const values: number[] = [];
    const observable = toDistinctObservable(source, (a, b) => a.count === b.count);
    const subscription = observable.subscribe((value) => values.push(value.count));
    source.value = { count: 1 };
    source.value = { count: 2 };
    subscription.unsubscribe();
    expect(values).toEqual([1, 2]);
  });

  it('clones snapshots and observes only the source until unsubscribed', () => {
    const source = signal({ nested: { count: 1 } });
    const unrelated = signal(0);
    const observable = toObservable(source);
    observable.current.nested.count = 999;
    const values: number[] = [];
    const { subscribe } = observable;
    const subscription = subscribe((value) => {
      void unrelated.value;
      values.push(value.nested.count);
      value.nested.count = 999;
    });
    expect(source.value.nested.count).toBe(1);
    unrelated.value = 1;
    source.value = { nested: { count: 2 } };
    expect(observable.current.nested.count).toBe(2);
    subscription.unsubscribe();
    source.value = { nested: { count: 3 } };
    expect(values).toEqual([1, 2]);
  });

  it('waits for a non-nullish value, including false, then automatically unsubscribes', () => {
    const source = signal<boolean | null | undefined>(undefined);
    const next = vi.fn();
    const subscription = toObservable(source).subscribeOnce(next);
    source.value = null;
    source.value = undefined;
    source.value = false;
    source.value = true;
    subscription.unsubscribe();
    expect(next).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('supports cancellation before a one-shot value arrives', () => {
    const source = signal<string | undefined>(undefined);
    const next = vi.fn();
    toObservable(source).subscribeOnce(next).unsubscribe();
    source.value = 'late';
    expect(next).not.toHaveBeenCalled();
  });

  it('clones an immediately available one-shot value and emits only once', () => {
    const source = signal({ nested: { count: 1 } });
    const next = vi.fn((value: typeof source.value) => {
      value.nested.count = 999;
    });
    const subscription = toObservable(source).subscribeOnce(next);
    expect(source.value.nested.count).toBe(1);
    source.value = { nested: { count: 2 } };
    subscription.unsubscribe();
    expect(next).toHaveBeenCalledExactlyOnceWith({ nested: { count: 999 } });
  });
});
