import styled from 'styled-components';

import { useDesignValues } from '@contentful/experiences-react';

export interface CardProps {
  title?: string;
  teaser?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
  // Design properties, auto-filled as props.
  backgroundColor?: string;
  color?: string;
}

// The `$`-prefixed props are styled-components transient props: they reach the
// style function but never the DOM, which keeps design keys out of the markup
// the same way destructuring them does in the inline-style components.
const Article = styled.article<{ $backgroundColor?: string; $color?: string }>`
  display: flex;
  flex-direction: column;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  background-color: ${({ $backgroundColor }) => $backgroundColor};
  color: ${({ $color }) => $color};
`;

const Body = styled.div`
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
`;

const CtaLink = styled.a<{ $tint?: string }>`
  margin-top: auto;
  display: inline-block;
  padding: 0.5rem 1rem;
  background: ${({ $tint }) => $tint ?? '#111'};
  color: #fff;
  text-decoration: none;
  border-radius: 0.25rem;
  align-self: flex-start;
`;

/**
 * Compact card: image + title + teaser + CTA. Content properties come from
 * a `Card from Promotion` DataAssembly binding.
 *
 * Styled with styled-components to show CSS-in-JS: the resolved design values
 * arrive as props, exactly as they do for the inline-style components, and are
 * passed into the styled components as transient props.
 *
 * This file is also the example app's one demonstration of the
 * `useDesignValues()` escape hatch — see `CardCta` below.
 */
export function Card({
  title,
  teaser,
  ctaLabel,
  ctaUrl,
  image,
  backgroundColor,
  color,
}: CardProps) {
  return (
    <Article $backgroundColor={backgroundColor} $color={color}>
      {image && (
        <img src={image} alt="" style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
      )}
      <Body>
        {title && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>}
        {teaser && <p style={{ margin: 0, lineHeight: 1.5 }}>{teaser}</p>}
        {ctaLabel && ctaUrl && <CardCta label={ctaLabel} url={ctaUrl} />}
      </Body>
    </Article>
  );
}

/**
 * The escape hatch, and the one case props can't cover: `CardCta` is a nested
 * presentational child, not a registered component, so the SDK has no props to
 * auto-fill onto it. `useDesignValues()` reads the resolved design record of the
 * nearest registered ancestor (the `Card`) off context, which lets the CTA tint
 * itself with the card's own `color` without `Card` threading it down by hand.
 */
function CardCta({ label, url }: { label: string; url: string }) {
  const { color } = useDesignValues<{ color?: string }>();

  return (
    <CtaLink href={url} $tint={color}>
      {label}
    </CtaLink>
  );
}
