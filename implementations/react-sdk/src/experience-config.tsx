import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import {
  BLOCKS,
  INLINES,
  TOP_LEVEL_BLOCKS,
  type Block,
  type Inline,
  type Text,
} from '@contentful/rich-text-types';
import {
  defineComponent,
  defineExperienceTemplate,
  useContentfulComponent,
  type Config,
} from '@contentful/experiences-react/client';
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

// Check the structure consumed by the maintained Rich Text renderer. This is
// not a validator for all editorial rules or a resolver for linked entries/assets.
function isRichTextNode(value: unknown): value is Block | Inline | Text {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  if (value.nodeType === 'text') {
    return (
      typeof value.value === 'string' &&
      Array.isArray(value.marks) &&
      value.marks.every((mark: unknown) => isRecord(mark) && typeof mark.type === 'string')
    );
  }
  if (!Array.isArray(value.content) || !value.content.every(isRichTextNode)) return false;
  if (Object.values(INLINES).some((type) => type === value.nodeType)) {
    return value.content.every(
      (child) =>
        child.nodeType === 'text' || Object.values(INLINES).some((type) => type === child.nodeType)
    );
  }
  return Object.values(BLOCKS).some((type) => type !== BLOCKS.DOCUMENT && type === value.nodeType);
}

function isDocument(value: unknown): value is ContentFields['richText'] {
  return (
    isRecord(value) &&
    value.nodeType === BLOCKS.DOCUMENT &&
    isRecord(value.data) &&
    Array.isArray(value.content) &&
    value.content.every(
      (node: unknown) =>
        isRichTextNode(node) && TOP_LEVEL_BLOCKS.some((type) => type === node.nodeType)
    )
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
  if (!isRecord(content.richText) || !isDocument(content.richText.document)) {
    throw new Error(`${registration}: expected richText.document to contain a Rich Text document.`);
  }
  return {
    title: content.title,
    text: content.text,
    richText: { document: content.richText.document },
  };
}

type CardProps = BoundContent & Omit<HTMLAttributes<HTMLElement>, 'slot'>;

const ContentCard = forwardRef<HTMLElement, CardProps>(function ContentCard(
  { title, text, richText, className, ...attributes },
  ref
) {
  // Also protect caller-supplied plans and the SDK's resolver-error fallback.
  const content = readContent({ title, text, richText }, 'codedComponent');
  return (
    <article
      {...attributes}
      ref={ref}
      className={['entry-card', className].filter(Boolean).join(' ')}
    >
      <header className="entry-card__header">
        <h3>{content.title}</h3>
      </header>
      <p>{content.text}</p>
      <div className="rich-text">{documentToReactComponents(content.richText.document)}</div>
    </article>
  );
});

// Registration-specific Fragment clickability stays outside the design-system card.
const RegisteredContentCard = forwardRef<HTMLElement, CardProps>(
  function RegisteredContentCard(props, ref) {
    const component = useContentfulComponent();
    const clickable = component?.attribution?.roots.some(
      (scope) => scope.entityKind === 'ExperienceFragment'
    );
    return <ContentCard data-ctfl-clickable={clickable ? true : undefined} {...props} ref={ref} />;
  }
);

interface TemplateProps extends CardProps {
  slot?: ReactNode[];
}

const CodedTemplate = forwardRef<HTMLElement, TemplateProps>(function CodedTemplate(
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
      <header className="entry-card__header">
        <h3>{content.title}</h3>
      </header>
      <p>{content.text}</p>
      <div className="rich-text">{documentToReactComponents(content.richText.document)}</div>
      {slot?.length ? (
        <div className="entry-card__nested-children">
          <span className="entry-card__badge entry-card__badge--slot">Slot: slot</span>
          {slot}
        </div>
      ) : null}
    </section>
  );
});

export const experienceConfig: Config = {
  components: {
    codedComponent: defineComponent<CardProps>({
      resolveData: ({ content }) => readContent(content, 'codedComponent'),
      component: RegisteredContentCard,
    }),
  },
  experienceTemplates: {
    codedExperienceTemplate: defineExperienceTemplate<TemplateProps>({
      resolveData: ({ content }) => readContent(content, 'codedExperienceTemplate'),
      component: CodedTemplate,
    }),
  },
};
