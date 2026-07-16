/**
 * A tiny in-code design-token table for the example. In a real integration
 * this is where you'd point at your design system — CSS custom properties, a
 * Tailwind theme, or a DTCG tokens package (see the patterns in
 * `experience-config.tsx`). Here we keep flat literals so the demo renders
 * against the payload with no extra dependencies.
 *
 * Token ids are dotted (`size.xl`, `color.text`) — the shape XDA emits in the
 * `DesignToken` envelopes for this space. `resolveToken` looks each id up
 * here and returns the underlying CSS value (or `undefined`, which the SDK
 * treats as "not resolvable" and drops from the design record).
 */

export const designTokens: Record<string, string> = {
  // ─── Spacing / sizing ─────────────────────────────────────────────────
  'size.none': '0',
  'size.sm': '12px',
  'size.md': '24px',
  'size.lg': '40px',
  'size.xl': '64px',

  // ─── Color ────────────────────────────────────────────────────────────
  // `color.none` maps to `transparent` so a "no background" token still
  // resolves to a real CSS value rather than being dropped.
  'color.none': 'transparent',
  'color.white': '#ffffff',
  'color.text': '#1f2937',

  // ─── Typography ───────────────────────────────────────────────────────
  'fontSize.sm': '14px',
  'fontSize.md': '16px',
  'fontSize.lg': '20px',
  'fontSize.xl': '28px',
  'fontSize.2xl': '36px',
  'fontSize.3xl': '48px',

  'fontWeight.regular': '400',
  'fontWeight.medium': '500',
  'fontWeight.bold': '700',
};
