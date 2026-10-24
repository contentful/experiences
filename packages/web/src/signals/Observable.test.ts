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

  it('observes only its source until unsubscribed', () => {
    const source = signal(1);
    const unrelated = signal(0);
    const values: number[] = [];
    const subscription = toObservable(source).subscribe((value) => {
      void unrelated.value;
      values.push(value);
    });
    unrelated.value = 1;
    source.value = 2;
    subscription.unsubscribe();
    source.value = 3;
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

  it('emits an immediately available one-shot value only once', () => {
    const source = signal(1);
    const next = vi.fn();
    const subscription = toObservable(source).subscribeOnce(next);
    source.value = 2;
    subscription.unsubscribe();
    expect(next).toHaveBeenCalledExactlyOnceWith(1);
  });
});
