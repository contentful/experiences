'use client';

import { Fragment, type CSSProperties, type ReactNode } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

// Minimal rich-text renderer (paragraphs + bold/italic) so the example stays
// dependency-free; a real app would use @contentful/rich-text-react-renderer.

interface Mark {
  type: string;
}
interface RichTextNode {
  nodeType: string;
  value?: string;
  marks?: Mark[];
  content?: RichTextNode[];
}

// XDA wraps the document as `{ __typename, document }`; inner can be null.
export interface RichTextProps {
  document?: {
    document?: RichTextNode | null;
  } | null;
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  switch (node.nodeType) {
    case 'document':
      return <Fragment key={key}>{(node.content ?? []).map(renderNode)}</Fragment>;
    case 'paragraph':
      return (
        <p key={key} style={{ margin: '0 0 12px' }}>
          {(node.content ?? []).map(renderNode)}
        </p>
      );
    case 'text': {
      let el: ReactNode = node.value ?? '';
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') el = <strong>{el}</strong>;
        if (mark.type === 'italic') el = <em>{el}</em>;
      }
      return <Fragment key={key}>{el}</Fragment>;
    }
    default:
      return <Fragment key={key}>{(node.content ?? []).map(renderNode)}</Fragment>;
  }
}

export function RichText({ document }: RichTextProps) {
  const design = useDesignValues();
  const doc = document?.document;
  if (!doc) return null;

  const style: CSSProperties = {
    color: '#4b5563',
    lineHeight: 1.6,
    fontSize: (design.fontSize as string) ?? undefined,
    textAlign: (design.align as CSSProperties['textAlign']) ?? undefined,
  };

  return <div style={style}>{renderNode(doc, 0)}</div>;
}
