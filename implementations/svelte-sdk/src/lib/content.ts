import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import { INLINES, validateRichTextDocument } from '@contentful/rich-text-types';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

import type { TypeContentWithoutLinkResolutionResponse } from '../contentful-generated.js';

export type ContentFields = TypeContentWithoutLinkResolutionResponse['fields'];

// The admin data assemblies alias internalTitle and wrap GraphQL richText.json.
export type BoundContent = {
  title: ContentFields['internalTitle'];
  text: ContentFields['text'];
  richText: { document: ContentFields['richText'] };
};

export type CardProps = BoundContent & Omit<HTMLAttributes<HTMLElement>, 'slot'>;
export type TemplateProps = CardProps & { slot?: Snippet[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDocument(value: unknown): value is ContentFields['richText'] {
  return validateRichTextDocument(value as ContentFields['richText']).length === 0;
}

function isSafeHyperlink(uri: unknown): uri is string {
  // Browsers strip some controls when parsing schemes; reject them before URL parsing.
  if (typeof uri !== 'string' || !uri.trim() || /\p{Cc}/u.test(uri)) return false;
  try {
    // A fixed HTTP base permits relative/hash links without consulting browser state.
    const { protocol } = new URL(uri, 'https://reference.invalid/');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol);
  } catch {
    return false;
  }
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Unsafe hyperlinks retain their rendered children, without an anchor or href. */
export function renderContentRichText(document: ContentFields['richText']): string {
  return documentToHtmlString(document, {
    renderNode: {
      [INLINES.HYPERLINK]: (node, next) => {
        const children = next(node.content);
        const uri: unknown = node.data.uri;
        return isSafeHyperlink(uri)
          ? `<a href="${escapeAttribute(uri)}">${children}</a>`
          : children;
      },
    },
  });
}

export function readContent(content: Record<string, unknown>, registration: string): BoundContent {
  if (typeof content.title !== 'string') {
    throw new Error(
      `${registration}: expected title to be a string (content.internalTitle binding).`
    );
  }
  if (typeof content.text !== 'string') {
    throw new Error(`${registration}: expected text to be a string (content.text binding).`);
  }
  const document = isRecord(content.richText) ? content.richText.document : undefined;
  if (!isDocument(document)) {
    throw new Error(
      `${registration}: expected richText.document to be a valid Contentful Rich Text document.`
    );
  }
  return {
    title: content.title,
    text: content.text,
    richText: { document },
  };
}
