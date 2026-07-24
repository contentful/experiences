// Design tokens are the abstract names ComponentTypes reference in
// `allowedResources`. Their runtime CSS values are resolved by the example
// app's own `resolveToken` (see examples/nextjs/lib/design-tokens.ts) — the
// server just tracks that these ids exist and what DTCG type they belong to.

export type DesignTokenType =
  | 'DTCG.Color'
  | 'DTCG.Dimension'
  | 'DTCG.FontWeight'
  | 'DTCG.FontFamily'
  | 'DTCG.Duration'
  | 'DTCG.CubicBezier'
  | 'DTCG.Number';

export type DesignTokenFixture = {
  id: string;
  type: DesignTokenType;
};

// Every token referenced anywhere in the fixture (allowedResources +
// experience.designProperties). If you add a token to a ComponentType or
// Experience node, add it here too or the CMA will reject the ComponentType.
export const designTokens: DesignTokenFixture[] = [
  // Colors
  { id: 'color.primary', type: 'DTCG.Color' },
  { id: 'color.primaryText', type: 'DTCG.Color' },
  { id: 'color.text', type: 'DTCG.Color' },
  { id: 'color.white', type: 'DTCG.Color' },
  { id: 'color.none', type: 'DTCG.Color' },
  // Sizes
  { id: 'size.xl', type: 'DTCG.Dimension' },
  { id: 'size.md', type: 'DTCG.Dimension' },
  { id: 'size.sm', type: 'DTCG.Dimension' },
  { id: 'size.none', type: 'DTCG.Dimension' },
  // Font sizes
  { id: 'fontSize.3xl', type: 'DTCG.Dimension' },
  { id: 'fontSize.lg', type: 'DTCG.Dimension' },
  { id: 'fontSize.md', type: 'DTCG.Dimension' },
  { id: 'fontSize.sm', type: 'DTCG.Dimension' },
  // Font weights
  { id: 'fontWeight.bold', type: 'DTCG.FontWeight' },
  { id: 'fontWeight.normal', type: 'DTCG.FontWeight' },
];
