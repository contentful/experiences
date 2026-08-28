import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

// Minimal rich-text renderer — matches the Next.js and SvelteKit examples'
// coverage: paragraphs + bold/italic marks. The document shape follows
// Contentful's rich-text-types (nodeType: 'document' | 'paragraph' | 'text',
// marks[]).

interface Mark {
  type: 'bold' | 'italic' | 'underline' | 'code';
}

interface TextNode {
  nodeType: 'text';
  value: string;
  marks?: Mark[];
}

interface Paragraph {
  nodeType: 'paragraph';
  content: TextNode[];
}

interface RichDoc {
  nodeType: 'document';
  content: Paragraph[];
}

function extractDoc(input: unknown): RichDoc | null {
  if (!input || typeof input !== 'object') return null;
  const outer = input as { document?: unknown; nodeType?: string };
  if (outer.nodeType === 'document') return outer as RichDoc;
  if (outer.document && typeof outer.document === 'object') {
    return extractDoc(outer.document);
  }
  return null;
}

@Component({
  selector: 'app-rich-text',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (doc(); as document) {
      <div [ngStyle]="style()">
        @for (paragraph of document.content; track $index) {
          <p style="margin: 0 0 0.75em; line-height: 1.5;">
            @for (span of paragraph.content; track $index) {
              @if (hasMark(span, 'bold')) {
                <strong>{{ span.value }}</strong>
              } @else if (hasMark(span, 'italic')) {
                <em>{{ span.value }}</em>
              } @else {
                {{ span.value }}
              }
            }
          </p>
        }
      </div>
    }
  `,
})
export class RichTextComponent {
  private readonly documentValue = signal<unknown>(undefined);
  protected readonly alignValue = signal<string | undefined>(undefined);
  protected readonly fontSizeValue = signal<string | undefined>(undefined);

  /** Content property. */
  @Input() set document(value: unknown) {
    this.documentValue.set(value);
  }

  /** Design property — this design system's shorthand for `text-align`. */
  @Input() set align(value: string | undefined) {
    this.alignValue.set(value);
  }

  /** Design property. */
  @Input() set fontSize(value: string | undefined) {
    this.fontSizeValue.set(value);
  }

  protected readonly doc = computed(() => extractDoc(this.documentValue()));

  protected hasMark(span: TextNode, type: Mark['type']): boolean {
    return span.marks?.some((mark) => mark.type === type) ?? false;
  }

  protected readonly style = computed(() => ({
    ...(this.alignValue() ? { textAlign: this.alignValue() } : {}),
    ...(this.fontSizeValue() ? { fontSize: this.fontSizeValue() } : {}),
  }));
}
