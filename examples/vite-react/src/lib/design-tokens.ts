// In-code token table for the example — `resolveToken` looks ids up here.
// A real integration would point at CSS vars, a Tailwind theme, or a DTCG package.
export const designTokens: Record<string, string> = {
  'size.none': '0',
  'size.sm': '12px',
  'size.md': '24px',
  'size.lg': '40px',
  'size.xl': '64px',

  'color.none': 'transparent', // resolves "no background" to a real value
  'color.white': '#ffffff',
  'color.text': '#1f2937',
  'color.primary': '#0f172a', // hero background
  'color.primaryText': '#f8fafc', // hero foreground

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
