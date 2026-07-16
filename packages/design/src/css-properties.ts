/*
 * The set of CSS property names `toCss` will emit, plus the key-normalization
 * it applies before matching.
 *
 * `useDesignValues()` returns ALL resolved design values — real CSS-shaped
 * ones (`fontSize`, `backgroundColor`, …) mixed with author-defined styling
 * that is NOT CSS (`variant`, `as`, `ratio`, `target`, `reverse`). Customer
 * payloads use whatever key names their design system authored — usually bare
 * (`fontSize`), sometimes `cf`-prefixed (`cfFontSize`) — so `toCss` can't rely
 * on a prefix to tell CSS from non-CSS.
 *
 * Instead it normalizes each key (strip an optional `cf` prefix, kebab/snake →
 * camelCase) and keeps it only if the result is in `CSS_PROPERTIES`. That
 * drops semantic keys like `variant` while converting `fontSize` / `cf-font-
 * size` / `font_size` all to `fontSize`.
 */

/**
 * Normalize a design-record key to a candidate CSS property name:
 *  - strip an optional leading `cf` prefix (`cfFontSize` / `cf-font-size` / `cf_font_size`)
 *  - convert kebab-case / snake_case to camelCase (`font-size` → `fontSize`)
 *  - leave already-camelCased keys untouched (`fontSize` → `fontSize`)
 */
export function toCssKey(key: string): string {
  const stripped = key.replace(/^cf[-_]?/, '');
  const base = stripped || key; // `cf` alone → keep original
  return base
    .replace(/[-_]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/^([A-Z])/, (c) => c.toLowerCase());
}

/** Whether a normalized key names a CSS property `toCss` is willing to emit. */
export function isCssProperty(normalizedKey: string): boolean {
  return CSS_PROPERTIES.has(normalizedKey);
}

/**
 * Curated whitelist of common CSS property names (camelCase). Not exhaustive —
 * it covers the layout, box, typography, color, border, and fl-/grid
 * properties a design system realistically drives. Extend as needed; a key
 * that isn't here is treated as non-CSS and dropped by `toCss`.
 */
export const CSS_PROPERTIES: ReadonlySet<string> = new Set([
  // Box model / sizing
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  'boxSizing',
  'aspectRatio',
  // Positioning / display
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'zIndex',
  'overflow',
  'overflowX',
  'overflowY',
  'visibility',
  'float',
  'clear',
  // Flexbox / grid
  'flex',
  'flexDirection',
  'flexWrap',
  'flexFlow',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'justifyContent',
  'justifyItems',
  'justifySelf',
  'alignItems',
  'alignContent',
  'alignSelf',
  'placeItems',
  'placeContent',
  'gap',
  'rowGap',
  'columnGap',
  'order',
  'grid',
  'gridTemplate',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridColumn',
  'gridRow',
  'gridArea',
  'gridAutoFlow',
  'gridAutoColumns',
  'gridAutoRows',
  // Typography
  'color',
  'font',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textAlign',
  'textAlignLast',
  'textDecoration',
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationStyle',
  'textTransform',
  'textOverflow',
  'textIndent',
  'textShadow',
  'whiteSpace',
  'wordBreak',
  'wordWrap',
  'overflowWrap',
  'writingMode',
  'verticalAlign',
  // Background
  'background',
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundSize',
  'backgroundRepeat',
  'backgroundAttachment',
  'backgroundClip',
  'backgroundOrigin',
  'backgroundBlendMode',
  // Border / outline
  'border',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'outline',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'outlineOffset',
  // Effects
  'opacity',
  'boxShadow',
  'filter',
  'backdropFilter',
  'mixBlendMode',
  'transform',
  'transformOrigin',
  'transition',
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction',
  'transitionDelay',
  'animation',
  'cursor',
  'pointerEvents',
  'userSelect',
  // Misc
  'content',
  'listStyle',
  'listStyleType',
  'listStylePosition',
  'objectFit',
  'objectPosition',
  'fill',
  'stroke',
  'strokeWidth',
]);
