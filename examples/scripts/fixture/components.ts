import type { ComponentFixture } from './types.js';

// Shared allowed-resource lists. The token strings must match the design-token
// table in the example app (examples/nextjs/lib/design-tokens.ts).
const COLOR_TOKENS = [
  'color.primary',
  'color.primaryText',
  'color.text',
  'color.white',
  'color.none',
];
const SIZE_TOKENS = ['size.xl', 'size.md', 'size.sm', 'size.none'];
const FONT_SIZE_TOKENS = ['fontSize.3xl', 'fontSize.lg', 'fontSize.md', 'fontSize.sm'];
const FONT_WEIGHT_TOKENS = ['fontWeight.bold', 'fontWeight.normal'];

const colorProp = (id: string, name: string, description = '') => ({
  id,
  name,
  description,
  type: 'DTCG.Color' as const,
  allowedResources: COLOR_TOKENS.map((value) => ({ type: 'DesignToken' as const, value })),
});

const sizeProp = (id: string, name: string, description = '') => ({
  id,
  name,
  description,
  type: 'DTCG.Dimension' as const,
  allowedResources: SIZE_TOKENS.map((value) => ({ type: 'DesignToken' as const, value })),
});

// --- Design-system primitives ------------------------------------------------
// Each is a shallow shape — enough to render, not a full copy of the source
// space's schemas. The example app's design-system components receive these
// design values as auto-filled props, declared by name on each component.

const Section: ComponentFixture = {
  id: 'Section',
  name: 'Section',
  description: 'Layout primitive — flex/grid row or column of children',
  contentProperties: [],
  designProperties: [
    {
      id: 'direction',
      name: 'Direction',
      type: 'String',
      validations: [{ regexp: { pattern: '^(row|column)$' } }],
    },
    {
      id: 'columns',
      name: 'Columns',
      type: 'String',
      validations: [{ regexp: { pattern: '^(auto|1|2|3|4)$' } }],
    },
    { id: 'itemAlign', name: 'Item align', type: 'String' },
    colorProp('backgroundColor', 'Background color'),
    sizeProp('gap', 'Gap'),
    sizeProp('verticalSpacing', 'Vertical spacing'),
    sizeProp('horizontalSpacing', 'Horizontal spacing'),
  ],
  slots: [{ id: 'children', name: 'Children' }],
};

const Heading: ComponentFixture = {
  id: 'Heading',
  name: 'Heading',
  description: 'Semantic HTML heading (h1–h6)',
  contentProperties: [{ id: 'text', name: 'Text', type: 'String' }],
  designProperties: [
    {
      id: 'as',
      name: 'Semantic tag',
      type: 'String',
      validations: [{ regexp: { pattern: '^h[1-6]$' } }],
    },
    { id: 'align', name: 'Align', type: 'String' },
    colorProp('color', 'Color'),
    {
      id: 'fontSize',
      name: 'Font size',
      type: 'DTCG.Dimension',
      allowedResources: FONT_SIZE_TOKENS.map((value) => ({ type: 'DesignToken', value })),
    },
    {
      id: 'fontWeight',
      name: 'Font weight',
      type: 'DTCG.FontWeight',
      allowedResources: FONT_WEIGHT_TOKENS.map((value) => ({ type: 'DesignToken', value })),
    },
  ],
};

const RichText: ComponentFixture = {
  id: 'RichText',
  name: 'Rich text',
  description: 'Minimal rich-text renderer',
  contentProperties: [{ id: 'document', name: 'Document', type: 'RichText' }],
  designProperties: [
    { id: 'align', name: 'Align', type: 'String' },
    colorProp('color', 'Color'),
    {
      id: 'fontSize',
      name: 'Font size',
      type: 'DTCG.Dimension',
      allowedResources: FONT_SIZE_TOKENS.map((value) => ({ type: 'DesignToken', value })),
    },
  ],
};

const Text: ComponentFixture = {
  id: 'Text',
  name: 'Text',
  description: 'Plain-text span',
  contentProperties: [{ id: 'text', name: 'Text', type: 'String' }],
  designProperties: [
    { id: 'align', name: 'Align', type: 'String' },
    colorProp('color', 'Color'),
    {
      id: 'fontSize',
      name: 'Font size',
      type: 'DTCG.Dimension',
      allowedResources: FONT_SIZE_TOKENS.map((value) => ({ type: 'DesignToken', value })),
    },
  ],
};

const Button: ComponentFixture = {
  id: 'Button',
  name: 'Button',
  description: 'Link styled as a button (label + url)',
  contentProperties: [
    { id: 'label', name: 'Label', type: 'String' },
    { id: 'url', name: 'URL', type: 'String' },
  ],
  designProperties: [
    {
      id: 'target',
      name: 'Target',
      type: 'String',
      validations: [{ regexp: { pattern: '^_(self|blank)$' } }],
    },
    colorProp('backgroundColor', 'Background color'),
    colorProp('color', 'Color'),
  ],
};

const Image: ComponentFixture = {
  id: 'Image',
  name: 'Image',
  description: 'Image (src + alt)',
  contentProperties: [
    { id: 'src', name: 'Source URL', type: 'String' },
    { id: 'alt', name: 'Alt text', type: 'String' },
  ],
  designProperties: [],
};

// --- Composed Components -------------------------------------------------
// These aren't primitives — they're editor-authored vocabulary the customer
// maps entry fields ONTO via DataAssembly. Their contentProperties are what the
// hero-assembly / card-assembly declare in their `return` blocks.

const heroPlain: ComponentFixture = {
  id: 'hero-plain',
  name: 'Hero: plain',
  description: 'Full-width hero — title + body + CTA + image, sourced from a promotion entry',
  contentProperties: [
    { id: 'title', name: 'Title', type: 'String', required: true },
    { id: 'body', name: 'Body', type: 'RichText' },
    { id: 'ctaLabel', name: 'CTA label', type: 'String' },
    { id: 'ctaUrl', name: 'CTA URL', type: 'String' },
    { id: 'image', name: 'Image URL', type: 'String' },
  ],
  designProperties: [colorProp('backgroundColor', 'Background color'), colorProp('color', 'Color')],
};

const card: ComponentFixture = {
  id: 'card',
  name: 'Card',
  description: 'Compact card — image + title + teaser + CTA, sourced from a promotion entry',
  contentProperties: [
    { id: 'title', name: 'Title', type: 'String', required: true },
    { id: 'teaser', name: 'Teaser', type: 'String' },
    { id: 'ctaLabel', name: 'CTA label', type: 'String' },
    { id: 'ctaUrl', name: 'CTA URL', type: 'String' },
    { id: 'image', name: 'Image URL', type: 'String' },
  ],
  designProperties: [colorProp('backgroundColor', 'Background color'), colorProp('color', 'Color')],
};

export const components: ComponentFixture[] = [
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
  heroPlain,
  card,
];
