<script lang="ts" module>
  // Minimal rich-text renderer — matches the Next.js example's coverage:
  // paragraphs + bold/italic marks. The document shape follows Contentful's
  // rich-text-types (nodeType: 'document' | 'paragraph' | 'text', marks[]).

  type Mark = { type: 'bold' | 'italic' | 'underline' | 'code' };
  type TextNode = { nodeType: 'text'; value: string; marks?: Mark[] };
  type Paragraph = { nodeType: 'paragraph'; content: TextNode[] };
  type RichDoc = { nodeType: 'document'; content: Paragraph[] };

  export interface RichTextProps {
    document?: unknown;
  }

  function extractDoc(input: unknown): RichDoc | null {
    if (!input || typeof input !== 'object') return null;
    // Handle both { document: {...} } wrappers (from GraphQL) and bare docs.
    const outer = input as { document?: unknown; nodeType?: string };
    if (outer.nodeType === 'document') return outer as RichDoc;
    if (outer.document && typeof outer.document === 'object') {
      return extractDoc(outer.document);
    }
    return null;
  }
</script>

<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { document }: RichTextProps = $props();
  const doc = $derived(extractDoc(document));

  const design = $derived(getDesignValues());
  const style = $derived.by(() => {
    const css = toCss(design);
    const cssStr = Object.entries(css)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
      .join('; ');
    const align = design.align ? `text-align: ${design.align}; ` : '';
    return `${align}${cssStr}`;
  });
</script>

{#if doc}
  <div {style}>
    {#each doc.content as p}
      <p style="margin: 0 0 0.75em; line-height: 1.5;">
        {#each p.content as span}
          {#if span.marks?.some((m) => m.type === 'bold')}<strong>{span.value}</strong>
          {:else if span.marks?.some((m) => m.type === 'italic')}<em>{span.value}</em>
          {:else}{span.value}{/if}
        {/each}
      </p>
    {/each}
  </div>
{/if}
