import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import { validateRichTextDocument } from '@contentful/rich-text-types';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import type { TypeContentWithoutLinkResolutionResponse } from './contentful-generated';

type ContentFields = TypeContentWithoutLinkResolutionResponse['fields'];
// The admin data assemblies alias internalTitle and wrap GraphQL richText.json.
type BoundContent = {
  title: ContentFields['internalTitle'];
  text: ContentFields['text'];
  richText: { document: ContentFields['richText'] };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDocument(value: unknown): value is ContentFields['richText'] {
  return validateRichTextDocument(value as ContentFields['richText']).length === 0;
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

function ContentBody({ title, text, richText }: BoundContent) {
  return (
    <>
      <header className="entry-card__header">
        <h3>{title}</h3>
      </header>
      <p>{text}</p>
      <div className="rich-text">{documentToReactComponents(richText.document)}</div>
    </>
  );
}

export type CardProps = BoundContent & Omit<HTMLAttributes<HTMLElement>, 'slot'>;

export const ContentCard = forwardRef<HTMLElement, CardProps>(function ContentCard(
  { title, text, richText, className, ...attributes },
  ref
) {
  // Failed resolveData can leave original content for the SDK's render fallback.
  const content = readContent({ title, text, richText }, 'codedComponent');
  return (
    <article
      {...attributes}
      ref={ref}
      className={['entry-card', className].filter(Boolean).join(' ')}
    >
      <ContentBody {...content} />
    </article>
  );
});

export interface TemplateProps extends CardProps {
  slot?: ReactNode[];
}

export const CodedTemplate = forwardRef<HTMLElement, TemplateProps>(function CodedTemplate(
  { title, text, richText, slot, className, ...attributes },
  ref
) {
  const content = readContent({ title, text, richText }, 'codedExperienceTemplate');
  return (
    <section
      {...attributes}
      ref={ref}
      className={['entry-card entry-card--slotted', className].filter(Boolean).join(' ')}
    >
      <ContentBody {...content} />
      {slot?.length ? (
        <div className="entry-card__nested-children">
          <span className="entry-card__badge entry-card__badge--slot">Slot: slot</span>
          {slot}
        </div>
      ) : null}
    </section>
  );
});
