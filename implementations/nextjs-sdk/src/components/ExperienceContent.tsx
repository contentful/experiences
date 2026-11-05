import type { Config } from '@contentful/experiences-nextjs/server';
import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { BLOCKS } from '@contentful/rich-text-types';
import type { TypeContentWithoutLinkResolutionResponse } from '../contentful-generated';

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

// The assembly binding supplies a document root; the maintained renderer owns
// child-node semantics. This deliberately does not validate the whole document.
function isDocument(value: unknown): value is ContentFields['richText'] {
  return (
    isRecord(value) &&
    value.nodeType === BLOCKS.DOCUMENT &&
    isRecord(value.data) &&
    Array.isArray(value.content)
  );
}

function readContent(content: Record<string, unknown>, registration: string): BoundContent {
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
    throw new Error(`${registration}: expected richText.document to contain a Rich Text document.`);
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

export type CardProps = BoundContent &
  Omit<HTMLAttributes<HTMLElement>, 'slot'> & { ref?: Ref<HTMLElement> };

export function ContentCard({ title, text, richText, className, ...attributes }: CardProps) {
  const content = readContent({ title, text, richText }, 'codedComponent');
  return (
    <article {...attributes} className={['entry-card', className].filter(Boolean).join(' ')}>
      <ContentBody {...content} />
    </article>
  );
}

export interface TemplateProps extends CardProps {
  slot?: ReactNode[];
}

export function CodedTemplate({
  title,
  text,
  richText,
  slot,
  className,
  ...attributes
}: TemplateProps) {
  const content = readContent({ title, text, richText }, 'codedExperienceTemplate');
  return (
    <section
      {...attributes}
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
}

export const experienceConfig: Config = {
  components: {
    codedComponent: ContentCard,
  },
  experienceTemplates: {
    codedExperienceTemplate: CodedTemplate,
  },
};
