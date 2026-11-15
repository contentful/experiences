// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { acquireSingleton, releaseSingleton } from './singleton.js';

const owners: string[] = [];
const acquire = () => {
  const owner = acquireSingleton();
  owners.push(owner);
  return owner;
};
afterEach(() => {
  for (const owner of owners.splice(0)) releaseSingleton(owner);
});

describe('Web singleton ownership', () => {
  it('rejects a second acquisition and permits replacement after release', () => {
    const first = acquire();
    expect(() => acquire()).toThrow(/already initialized/);
    releaseSingleton(first);
    expect(() => acquire()).not.toThrow();
  });

  it('keeps the live lock when an unrelated owner attempts release', () => {
    acquire();
    releaseSingleton('unrelated');
    expect(() => acquire()).toThrow(/already initialized/);
  });

  it('does not let an idempotent stale release unlock a replacement', () => {
    const first = acquire();
    releaseSingleton(first);
    const replacement = acquire();
    releaseSingleton(first);
    releaseSingleton(first);
    expect(() => acquire()).toThrow(/already initialized/);
    releaseSingleton(replacement);
    expect(() => acquire()).not.toThrow();
  });
});
