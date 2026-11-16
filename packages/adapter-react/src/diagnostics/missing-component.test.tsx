import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('MissingComponent client boundary', () => {
  it("declares MissingComponent as a client component ('use client')", () => {
    const source = readFileSync(
      new URL('../diagnostics/missing-component.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/^\s*['"]use client['"];/m);
  });
});
